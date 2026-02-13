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
// PRIORITY SORT
// =========================

function reorderQueue() {
  queue.sort((a, b) =>
    b.severity - a.severity || a.time - b.time
  );
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
