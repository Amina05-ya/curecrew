const express = require("express");
const cors = require("cors");
const { v4: uuid } = require("uuid");

const app = express();
app.use(cors());
app.use(express.json());

// =========================
// MEMORY STORAGE
// =========================

let queue = [];
let medicines = [];
let medicineReminders = [];
let reminders = [];
let patientNotifications = [];

let doctorStatus = "AVAILABLE";
let delayMinutes = 0;
let tokenCounter = 1;

// =========================
// DOCTOR AUTH SYSTEM
// =========================

// =========================
// DOCTOR AUTH SYSTEM
// =========================

let doctors = [];

// doctor signup
app.post("/doctor/signup", (req, res) => {

  const { name, email, password } = req.body;

  if (doctors.find(d => d.email === email))
    return res.json({ message: "Doctor already exists" });

  const doctor = {
    id: uuid(),
    name,
    email,
    password
  };

  doctors.push(doctor);

  res.json({ message: "Signup successful" });

});

// doctor login
app.post("/doctor/login", (req, res) => {

  const { email, password } = req.body;

  const doctor = doctors.find(
    d => d.email === email && d.password === password
  );

  if (!doctor)
    return res.json({ message: "Invalid credentials" });

  res.json({
    message: "Login success",
    doctor: {
      id: doctor.id,
      name: doctor.name
    }
  });

});


// =========================
// HOSPITAL + DOCTOR DATA
// =========================

const hospitalData = {
  "Chennai": {
    "Apollo Hospital": [
      "Dr. Meera Nair",
      "Dr. Rajesh Kumar"
    ],
    "City Care Clinic": [
      "Dr. Anjali Sharma"
    ]
  },

  "Bangalore": {
    "Metro Health": [
      "Dr. Vivek Patel"
    ],
    "Green Valley": [
      "Dr. Arjun Reddy"
    ]
  }
};

// cities
app.get("/cities", (req,res)=>{
  res.json(Object.keys(hospitalData));
});

// hospitals by city
app.get("/hospitals/:city",(req,res)=>{
  const city=req.params.city;
  res.json(Object.keys(hospitalData[city]||{}));
});

// doctors by hospital
app.get("/doctors/:city/:hospital",(req,res)=>{
  const {city,hospital}=req.params;
  res.json(
    hospitalData[city]?.[hospital] || []
  );
});

// =========================
// BOOK APPOINTMENT → QUEUE
// =========================

app.post("/book-appointment",(req,res)=>{

  const { name, severity } = req.body;

  const token = generateAppointmentToken();

  const patient = {

    id: uuid(),
    name: name || "Patient",
    token,
    severity: severity || 1,
    time: Date.now()

  };

  // auto add to queue
  queue.push(patient);

  reorderQueue();

  const position =
    queue.findIndex(p => p.id === patient.id);

  let wait = position * 5;

  if(doctorStatus !== "AVAILABLE")
    wait += delayMinutes;

  const time =
    new Date(Date.now()+wait*60000)
    .toLocaleTimeString();

  res.json({

    status:"Confirmed",
    token,
    queuePosition: position+1,
    estimatedWait: wait,
    appointmentTime: time,
    doctorStatus

  });

});

app.post("/call-next",(req,res)=>{
if(queue.length>0) queue.shift();
res.json({message:"Next patient called"});
});


// =========================
// APPOINTMENT TOKEN SYSTEM
// =========================

let appointmentToken = 10;

function generateAppointmentToken(){

  const token = appointmentToken;

  appointmentToken++;

  if(appointmentToken > 15)
    appointmentToken = 10;

  return token;
}


// =========================
// USER STORAGE
// =========================

let users = []; // doctors + patients


// =========================
// PRIORITY SORT
// =========================

function reorderQueue() {
  queue.sort((a, b) => a.token - b.token);
}


// =========================
// QUEUE REMINDER ENGINE
// =========================

function generateReminders() {

  const baseConsult = 5;
  reminders = [];

  queue.forEach((patient, index) => {

    let wait = index * baseConsult;

    if (doctorStatus !== "AVAILABLE")
      wait += delayMinutes;

    const position = index + 1;

    let message = `
📍 Position in queue: ${position}<br>
⏱ Estimated waiting time: ${wait} minutes<br>
`;

    if (doctorStatus === "EMERGENCY") {

      message +=
        "🚨 Doctor handling emergency — delay expected.";

    }
    else if (doctorStatus === "REFRESHMENT") {

      message +=
        "☕ Doctor on refreshment break — please wait.";

    }
    else if (index === 0) {

      message +=
        "✅ It's your turn now — please proceed.";

    }
    else if (wait <= 5) {

      message +=
        "⏳ Almost your turn — stay nearby.";

    }
    else {

      message +=
        "🕒 Please relax, you’ll be called soon.";
    }

    reminders.push({
      token: patient.token,
      message,
      position,
      estimated_wait: wait,
      time: new Date()
    });

  });

}

// =========================
// PATIENT NOTIFICATION ENGINE
// =========================

function generatePatientNotifications() {

  patientNotifications = reminders.map(r => ({
    token: r.token,
    message: r.message,
    position: r.position,
    time: r.time
  }));

}

// =========================
// MEDICINE REMINDER ENGINE
// =========================

function checkMedicineReminders() {

  const now = Date.now();

  medicines.forEach(m => {

    if (!m.nextReminder) return;

    if (now >= m.nextReminder) {

      medicineReminders.push({
        medicine: m.name,
        dosage: m.dosage,
        message: `💊 Take ${m.name} (${m.dosage})`,
        time: new Date()
      });

      m.nextReminder =
        now + m.interval * 60000;
    }

  });

}

// run engines
setInterval(() => {
  generateReminders();
  generatePatientNotifications();
}, 5000);

setInterval(checkMedicineReminders, 10000);

// =========================
// SMART TOKEN JOIN
// =========================

app.post("/smart-join", (req, res) => {

  const text = (req.body.text || "").toLowerCase();
  const name = req.body.name || "Unknown Patient";

  let severity = 1;

  if (text.includes("chest") || text.includes("breath")) severity = 5;
  else if (text.includes("fever") || text.includes("pain")) severity = 3;

  const patient = {
    id: uuid(),
    token: tokenCounter++,
    name,
    severity,
    time: Date.now()
  };

  queue.push(patient);
  reorderQueue();

  generateReminders();
  generatePatientNotifications();

  const position =
    queue.findIndex(p => p.id === patient.id);

  let wait = position * 5;

  if (doctorStatus !== "AVAILABLE")
    wait += delayMinutes;

  res.json({
    message: "Token generated",
    token: patient.token,
    position: position + 1,
    estimated_wait_minutes: wait,
    doctorStatus
  });

});

// =========================
// PATIENT STATUS
// =========================

app.get("/patient/:token", (req, res) => {

  const token = parseInt(req.params.token);
  const patient = queue.find(p => p.token === token);

  if (!patient)
    return res.json({ message: "Token not found" });

  const index = queue.indexOf(patient);

  let wait = index * 5;

  if (doctorStatus !== "AVAILABLE")
    wait += delayMinutes;

  res.json({
    token,
    name: patient.name,
    position: index + 1,
    estimated_wait_minutes: wait,
    doctorStatus
  });

});

// =========================
// VIEW DATA APIs
// =========================

app.get("/queue", (req, res) => res.json(queue));
app.get("/reminders", (req, res) => res.json(reminders));
app.get("/notifications", (req, res) => res.json(patientNotifications));

// =========================
// CALL NEXT PATIENT (LIVE QUEUE)
// =========================

app.post("/call-next", (req, res) => {

  if (queue.length === 0) {
    return res.json({ message: "Queue empty" });
  }

  // remove first patient
  const calledPatient = queue.shift();

  // update system
  reorderQueue();
  generateReminders();
  generatePatientNotifications();

  res.json({
    message: "Patient called",
    called: calledPatient,
    queue
  });

});


// =========================
// DOCTOR CONTROL
// =========================

app.post("/doctor/status", (req, res) => {

  doctorStatus = req.body.status || "AVAILABLE";
  delayMinutes = req.body.delay || 0;

  generateReminders();
  generatePatientNotifications();

  res.json({ doctorStatus, delayMinutes });

});

app.get("/doctor/status", (req, res) =>
  res.json({ doctorStatus, delayMinutes })
);

// =========================
// MEDICINE TRACKER
// =========================

app.post("/medicine", (req, res) => {

  const interval = parseInt(req.body.interval) || 1;

  const med = {
    id: uuid(),
    name: req.body.name,
    dosage: req.body.dosage,
    status: "pending",
    interval,
    nextReminder: Date.now() + interval * 60000
  };

  medicines.push(med);

  res.json({ message: "Medicine added", medicines });

});

app.get("/medicines", (req, res) =>
  res.json(medicines)
);

app.get("/medicine-reminders", (req, res) =>
  res.json(medicineReminders)
);

app.post("/medicine/taken/:id", (req, res) => {

  const med = medicines.find(
    m => m.id === req.params.id
  );

  if (med) {

    med.status = "taken";
    med.nextReminder =
      Date.now() + med.interval * 60000;

  }

  res.json({
    message: "Medicine taken",
    medicines
  });

});

// =========================
// SIGNUP
// =========================

app.post("/signup", (req, res) => {

  const { name, email, password, role } = req.body;

  const exists = users.find(u => u.email === email);

  if (exists)
    return res.json({ message: "User exists" });

  users.push({ name, email, password, role });

  res.json({ message: "Signup successful" });

});

// =========================
// LOGIN
// =========================

app.post("/login", (req, res) => {

  const { email, password } = req.body;

  const user = users.find(
    u => u.email === email && u.password === password
  );

  if (!user)
    return res.json({ message: "Invalid login" });

  res.json({
    message: "Login success",
    role: user.role,
    name: user.name
  });

});

// hospital search
app.get("/search/hospital", (req, res) => {

  const q = (req.query.q || "").toLowerCase();

  const results = hospitals.filter(h =>
    h.toLowerCase().includes(q)
  );

  res.json(results);
});

// doctor search
app.get("/search/doctor", (req, res) => {

  const q = (req.query.q || "").toLowerCase();

  const results = doctors.filter(d =>
    d.toLowerCase().includes(q)
  );

  res.json(results);
});


// =========================
// DASHBOARD
// =========================

app.get("/dashboard", (req, res) => {

  const emergencyCount =
    queue.filter(p => p.severity >= 5).length;

  const taken =
    medicines.filter(m => m.status === "taken").length;

  const adherence =
    medicines.length === 0
      ? 0
      : Math.round((taken / medicines.length) * 100);

  res.json({
    totalPatients: queue.length,
    emergencyCount,
    doctorStatus,
    delayMinutes,
    medicineAdherencePercent: adherence
  });

});

// =========================
// SERVER START
// =========================

app.listen(3000, () =>
  console.log("🚀 Smart Hospital System Running")
);
