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
let reminders = [];

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
// REMINDER ENGINE
// =========================

function generateReminders() {

  const baseConsult = 5;
  reminders = [];

  queue.forEach((patient, index) => {

    let wait = index * baseConsult;

    if (doctorStatus !== "AVAILABLE")
      wait += delayMinutes;

    const positionText =
      `📍 Position in queue: ${index + 1}`;

    let message = "";

    // emergency
    if (doctorStatus === "EMERGENCY") {

      message =
        `${positionText}<br>🚨 Doctor is handling an emergency — please wait.`;

    }
    // refreshment
    else if (doctorStatus === "REFRESHMENT") {

      message =
        `${positionText}<br>☕ Doctor on refreshment break — consultation resumes soon.`;

    }
    // immediate turn
    else if (index === 0) {

      message =
        `${positionText}<br>🚨 It's your turn now — please proceed.`;

    }
    // near turn
    else if (wait <= 5) {

      message =
        `${positionText}<br>⏳ Within 5 minutes it's your turn — please be ready.`;

    }
    // general wait
    else {

      message =
        `${positionText}<br>${wait} minutes estimated wait — relax nearby.`;

    }

    reminders.push({
      token: patient.token,
      message,
      position: index + 1,
      time: new Date()
    });

  });

}

// auto refresh reminders
setInterval(generateReminders, 5000);

// =========================
// SMART TOKEN JOIN
// =========================

app.post("/smart-join", (req, res) => {

  const text = (req.body.text || "").toLowerCase();
  const name = req.body.name || "Unknown Patient";

  let severity = 1;

  if (text.includes("chest") || text.includes("breath")) severity = 5;
  else if (text.includes("fever") || text.includes("pain")) severity = 3;

  const token = tokenCounter++;

  const patient = {
    id: uuid(),
    token,
    name,
    severity,
    time: Date.now()
  };

  queue.push(patient);
  reorderQueue();
  generateReminders();

  const position = queue.findIndex(p => p.id === patient.id);

  let wait = position * 5;

  if (doctorStatus !== "AVAILABLE")
    wait += delayMinutes;

  res.json({
    message: "Token generated",
    token,
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
// VIEW QUEUE
// =========================

app.get("/queue", (req, res) => {
  res.json(queue);
});

// =========================
// VIEW REMINDERS
// =========================

app.get("/reminders", (req, res) => {
  res.json(reminders);
});

// =========================
// DOCTOR STATUS CONTROL
// =========================

app.post("/doctor/status", (req, res) => {

  doctorStatus = req.body.status || "AVAILABLE";
  delayMinutes = req.body.delay || 0;

  generateReminders();

  res.json({ doctorStatus, delayMinutes });

});

app.get("/doctor/status", (req, res) => {
  res.json({ doctorStatus, delayMinutes });
});

// =========================
// MEDICINE TRACKER
// =========================

app.post("/medicine", (req, res) => {

  const med = {
    id: uuid(),
    name: req.body.name,
    dosage: req.body.dosage,
    status: "pending"
  };

  medicines.push(med);

  res.json(medicines);

});

app.get("/medicines", (req, res) => {
  res.json(medicines);
});

app.post("/medicine/taken/:id", (req, res) => {

  const med = medicines.find(m => m.id === req.params.id);
  if (med) med.status = "taken";

  res.json(medicines);

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
  console.log("🚀 Smart Hospital Queue + Position Reminder Running")
);


