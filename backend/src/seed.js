require('dotenv').config();
const mongoose = require('mongoose');
const { Department, Provider } = require('./models');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ai_receptionist_poc');
  const departmentSeeds = [
    { name: 'Dermatology', slug: 'dermatology' },
    { name: 'Cardiology', slug: 'cardiology' },
    { name: 'General Medicine', slug: 'general-medicine' }
  ];
  const departments = {};
  for (const item of departmentSeeds) {
    departments[item.slug] = await Department.findOneAndUpdate(
      { slug: item.slug }, { $set: item }, { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  const providerSeeds = [
  // Dermatology — 3 doctors
  {
    name: 'Dr. Meera Raman',
    slug: 'meera-derm',
    department: departments.dermatology._id
  },
  {
    name: 'Dr. Arjun Kumar',
    slug: 'arjun-derm',
    department: departments.dermatology._id
  },
  {
    name: 'Dr. Divya Menon',
    slug: 'divya-derm',
    department: departments.dermatology._id
  },

  // Cardiology — 3 doctors
  {
    name: 'Dr. Priya Shah',
    slug: 'priya-cardio',
    department: departments.cardiology._id
  },
  {
    name: 'Dr. Vikram Reddy',
    slug: 'vikram-cardio',
    department: departments.cardiology._id
  },
  {
    name: 'Dr. Sanjay Iyer',
    slug: 'sanjay-cardio',
    department: departments.cardiology._id
  },

  // General Medicine — 3 doctors
  {
    name: 'Dr. Karthik Rao',
    slug: 'karthik-general',
    department: departments['general-medicine']._id
  },
  {
    name: 'Dr. Anitha Krishnan',
    slug: 'anitha-general',
    department: departments['general-medicine']._id
  },
  {
    name: 'Dr. Rahul Verma',
    slug: 'rahul-general',
    department: departments['general-medicine']._id
  }
];
  for (const item of providerSeeds) {
    await Provider.findOneAndUpdate(
      { name: item.name }, {
        $set: { name: item.name, department: item.department, active: true, workingStart: '09:00', workingEnd: '17:00', slotMinutes: 30, workingDays: [1,2,3,4,5,6] }
      }, { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  console.log('Seed complete: departments and demo providers are ready.');
  await mongoose.disconnect();
}
main().catch(err => { console.error(err); process.exit(1); });
