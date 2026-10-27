
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

  // Patient type selection state
  showPatientTypeActions = false;

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

      this.updateControlsFromHistory();
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

  private isPatientTypePrompt(reply: string): boolean {
    return /are you an existing patient|existing patient or a new patient|existing patient|new patient/i.test(
      reply
    );
  }

  private isDepartmentPrompt(reply: string): boolean {
    return /which department|select a department|choose a department|what department|please select general medicine|general medicine, dermatology, or cardiology/i.test(
      reply
    );
  }

  private updateControlsFromHistory(): void {
    const lastAssistantMessage = [...this.messages]
      .reverse()
      .find((message) => message.role === 'assistant');

    if (!lastAssistantMessage) {
      this.showPatientTypeActions = false;
      this.showDepartmentDropdown = false;
      return;
    }

    this.showPatientTypeActions = this.isPatientTypePrompt(
      lastAssistantMessage.text
    );

    this.showDepartmentDropdown = this.isDepartmentPrompt(
      lastAssistantMessage.text
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
   * Select an appointment slot.
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
   * Send the patient's selected appointment action.
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

          // Detect patient-type prompts from the backend response.
          this.showPatientTypeActions = this.isPatientTypePrompt(reply);

          // Detect department prompts from the backend response.
          this.showDepartmentDropdown = this.isDepartmentPrompt(reply);

          this.selectedDepartment = '';

          /*
           * Show appointment action buttons when the backend detects
           * an existing appointment.
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

          // Also show department cards when no providers are available.
          const noAvailability =
            /no (?:doctors?|providers?|availability|available doctors|available providers)/i.test(
              reply
            ) ||
            /(?:no doctors?|no providers?) (?:are )?available/i.test(
              reply
            );

          if (noAvailability) {
            this.showDepartmentDropdown = true;
          }

          // Update appointment completion state.
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

  newConversation(): void {
    if (!this.isBrowser || this.loading) {
      return;
    }

    this.messages = [];
    this.bookingCompleted = false;
    this.showPatientTypeActions = false;
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
          const reply =
            response.reply ||
            'Welcome to CareConnect! How can I help you today?';

          this.messages.push({
            role: 'assistant',
            text: reply,
            time: this.now()
          });

          this.showPatientTypeActions = this.isPatientTypePrompt(reply);
          this.showDepartmentDropdown = this.isDepartmentPrompt(reply);

          this.updateControlsFromHistory();
          this.persistMessages();

          setTimeout(() => this.scrollToBottom(), 0);
        },

        error: () => {
          this.addWelcomeMessage();
          this.updateControlsFromHistory();
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