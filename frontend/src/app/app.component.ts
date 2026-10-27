
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Component, Inject, PLATFORM_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface Doctor {
  number: number;
  name: string;
  specialty?: string;
  qualification?: string;
  experienceYears?: number;
}

type AppointmentAction = 'keep' | 'reschedule' | 'cancel';

interface ChatMessage {
  role: 'assistant' | 'user';
  text: string;
  time: string;
  providers?: Doctor[];
  actions?: AppointmentAction[];
}

export interface AppointmentSlot {
  date: string;
  dateLabel: string;
  startTime: string;
  endTime: string;
}

interface ReceptionResponse {
  reply?: string;
  status?: string;
  sessionId?: string;
  providers?: Doctor[];
  slots?: AppointmentSlot[];
  appointment?: {
    appointmentId?: string;
    patientId?: string;
    patientName?: string;
    doctor?: string;
    department?: string;
    date?: string;
    startTime?: string;
    endTime?: string;
    status?: string;
  };
  [key: string]: unknown;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  readonly apiUrl = 'http://localhost:3000/api/agent/reception';

  messages: ChatMessage[] = [];
  inputText = '';
  loading = false;
  bookingCompleted = false;
  sessionId = '';
  isBrowser = false;

  // Department selection state
  showDepartmentDropdown = false;
  selectedDepartment = '';

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);

    if (this.isBrowser) {
      this.sessionId = this.getOrCreateSessionId();
      this.restoreMessages();

      if (!this.messages.length) {
        this.addWelcomeMessage();
        this.persistMessages();
      }

      this.updateDepartmentDropdownFromHistory();
    }
  }

  private now(): string {
    return new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private addWelcomeMessage(): void {
    this.messages.push({
      role: 'assistant',
      text: 'Welcome to CareConnect! How can I help you today?',
      time: this.now()
    });
  }

  private getOrCreateSessionId(): string {
    const key = 'careconnect-session-id';
    let id = sessionStorage.getItem(key);

    if (!id) {
      id = `cc-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;

      sessionStorage.setItem(key, id);
    }

    return id;
  }

  private restoreMessages(): void {
    try {
      const saved = sessionStorage.getItem('careconnect-chat-history');

      if (saved) {
        this.messages = JSON.parse(saved) as ChatMessage[];
      }

      this.bookingCompleted =
        sessionStorage.getItem('careconnect-booking-completed') === 'true';
    } catch {
      this.messages = [];
      this.bookingCompleted = false;
    }
  }

  private persistMessages(): void {
    if (!this.isBrowser) {
      return;
    }

    sessionStorage.setItem(
      'careconnect-chat-history',
      JSON.stringify(this.messages)
    );

    sessionStorage.setItem(
      'careconnect-booking-completed',
      String(this.bookingCompleted)
    );
  }

  sendQuickReply(value: string): void {
    this.inputText = value;
    this.sendMessage();
  }

  /**
   * Select a doctor from the doctor cards.
   */
  selectDoctor(doctor: Doctor): void {
    if (this.loading || !doctor?.name) {
      return;
    }

    this.sendTextToReceptionist(doctor.name);
  }

  /**
   * Select a slot if the HTML renders appointment slot buttons.
   */
  selectSlot(slot: unknown): void {
    if (this.loading || slot == null) {
      return;
    }

    const slotText =
      typeof slot === 'string'
        ? slot
        : typeof slot === 'object'
          ? String(
              (slot as { label?: string; startTime?: string }).label ??
              (slot as { startTime?: string }).startTime ??
              ''
            )
          : String(slot);

    if (slotText.trim()) {
      this.sendTextToReceptionist(slotText);
    }
  }

  /**
   * Send the patient's selected existing-appointment action.
   * The backend receives exactly: keep, reschedule, or cancel.
   */
  chooseAppointmentAction(action: AppointmentAction): void {
    if (this.loading) {
      return;
    }

    this.sendTextToReceptionist(action);
  }

  sendMessage(): void {
    this.sendTextToReceptionist(this.inputText);
  }

  /**
   * Shared API function for typed messages and clickable options.
   */
  private sendTextToReceptionist(value: string): void {
    const message = value.trim();

    if (!message || this.loading || !this.isBrowser) {
      return;
    }

    this.showDepartmentDropdown = false;
    this.selectedDepartment = '';

    this.messages.push({
      role: 'user',
      text: message,
      time: this.now()
    });

    this.inputText = '';
    this.loading = true;
    this.persistMessages();

    this.http
      .post<ReceptionResponse>(this.apiUrl, {
        message,
        sessionId: this.sessionId
      })
      .subscribe({
        next: (response) => {
          // Keep the session ID in sync if the server returns one.
          if (response.sessionId) {
            this.sessionId = response.sessionId;
            sessionStorage.setItem(
              'careconnect-session-id',
              this.sessionId
            );
          }

          const reply =
            typeof response.reply === 'string'
              ? response.reply
              : 'I could not process that message. Please try again.';

          /*
           * Show action buttons when the backend detects an existing
           * appointment and returns status "already_booked".
           *
           * The text check also supports a backend response that
           * includes the appointment-management prompt without a status.
           */
          const hasExistingAppointmentActions =
            response.status === 'already_booked' ||
            /keep appointment[\s\S]*reschedule appointment[\s\S]*cancel appointment/i.test(
              reply
            );

          this.messages.push({
            role: 'assistant',
            text: reply,
            time: this.now(),
            providers: Array.isArray(response.providers)
              ? response.providers
              : [],
            actions: hasExistingAppointmentActions
              ? ['keep', 'reschedule', 'cancel']
              : undefined
          });

          // Show department cards when the receptionist asks for a department.
          const asksForDepartment =
            /which department do you need|select a department|choose a department|what department do you need/i.test(
              reply
            );

          const noAvailability =
            /no (?:doctors?|providers?|availability|available doctors|available providers)/i.test(
              reply
            ) ||
            /(?:no doctors?|no providers?) (?:are )?available/i.test(
              reply
            );

          if (asksForDepartment || noAvailability) {
            this.showDepartmentDropdown = true;
            this.selectedDepartment = '';
          } else {
            this.showDepartmentDropdown = false;
            this.selectedDepartment = '';
          }

          if (
            response.status === 'completed' ||
            response.status === 'booked'
          ) {
            this.bookingCompleted = true;
          } else if (
            response.status === 'cancelled' ||
            response.status === 'rescheduled'
          ) {
            this.bookingCompleted = false;
          }

          this.loading = false;
          this.persistMessages();

          setTimeout(() => this.scrollToBottom(), 0);
        },

        error: (error) => {
          const detail =
            error?.error?.message ||
            'Could not connect to the receptionist service.';

          this.messages.push({
            role: 'assistant',
            text:
              `${detail} Please confirm the backend is running at ` +
              'http://localhost:3000 and MongoDB is connected.',
            time: this.now()
          });

          this.loading = false;
          this.persistMessages();

          setTimeout(() => this.scrollToBottom(), 0);
        }
      });

    this.scrollToBottom();
  }

  continueWithDepartment(department: string): void {
    if (this.loading) {
      return;
    }

    this.selectedDepartment = department;
    this.sendTextToReceptionist(department);
  }

  private updateDepartmentDropdownFromHistory(): void {
    const lastAssistantMessage = [...this.messages]
      .reverse()
      .find((message) => message.role === 'assistant');

    if (!lastAssistantMessage) {
      this.showDepartmentDropdown = false;
      return;
    }

    this.showDepartmentDropdown =
      /which department do you need|select a department|choose a department|what department do you need/i.test(
        lastAssistantMessage.text
      );
  }

  newConversation(): void {
    if (!this.isBrowser || this.loading) {
      return;
    }

    this.messages = [];
    this.bookingCompleted = false;
    this.showDepartmentDropdown = false;
    this.selectedDepartment = '';
    this.inputText = '';

    sessionStorage.removeItem('careconnect-chat-history');
    sessionStorage.removeItem('careconnect-booking-completed');

    this.http
      .post<ReceptionResponse>(this.apiUrl, {
        message: 'restart',
        sessionId: this.sessionId
      })
      .subscribe({
        next: (response) => {
          this.messages.push({
            role: 'assistant',
            text:
              response.reply ||
              'Welcome to CareConnect! How can I help you today?',
            time: this.now()
          });

          this.updateDepartmentDropdownFromHistory();
          this.persistMessages();
          setTimeout(() => this.scrollToBottom(), 0);
        },

        error: () => {
          this.addWelcomeMessage();
          this.persistMessages();
        }
      });
  }

  onEnter(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;

    if (!keyboardEvent.shiftKey) {
      keyboardEvent.preventDefault();
      this.sendMessage();
    }
  }

  private scrollToBottom(): void {
    if (!this.isBrowser) {
      return;
    }

    setTimeout(() => {
      const element = document.querySelector('.messages');

      if (element) {
        element.scrollTop = element.scrollHeight;
      }
    }, 0);
  }

  trackByIndex(index: number): number {
    return index;
  }
}
