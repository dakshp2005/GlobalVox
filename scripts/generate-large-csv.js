// One-off generator for a large sample CSV to test import/processing at
// scale. Not part of the app runtime.
//
// Usage: node scripts/generate-large-csv.js [count] [outFile]

const fs = require("fs");
const path = require("path");

const count = Number(process.argv[2] || 1000);
const outFile = process.argv[3] || `sample-invitees-${count}.csv`;

const firstNames = [
  "Rahul", "Priya", "Amit", "Sneha", "Karan", "Divya", "Rohan", "Ananya",
  "Vikram", "Pooja", "Arjun", "Neha", "Sanjay", "Kavita", "Manish", "Ritu",
  "Deepak", "Shreya", "Nikhil", "Meera", "Suresh", "Anjali", "Rajesh", "Isha",
  "Varun", "Swati", "Gaurav", "Pallavi", "Aditya", "Nisha",
];
const lastNames = [
  "Sharma", "Shah", "Patel", "Verma", "Mehta", "Nair", "Gupta", "Iyer",
  "Rao", "Singh", "Kumar", "Reddy", "Joshi", "Agarwal", "Desai", "Kapoor",
  "Malhotra", "Bhatt", "Chauhan", "Pillai",
];
const cities = ["mumbai", "delhi", "pune", "ahmedabad", "bangalore", "chennai"];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pad(n, len) {
  return String(n).padStart(len, "0");
}

const rows = ["id,name,phone,email"];

for (let i = 1; i <= count; i++) {
  const first = pick(firstNames);
  const last = pick(lastNames);
  const name = `${first} ${last}`;

  // ~3% of rows are intentionally invalid, to exercise import validation at scale.
  const roll = Math.random();

  let phone = `+91${pad(6000000000 + i, 10)}`;
  let email = `${first.toLowerCase()}.${last.toLowerCase()}${i}@${pick(cities)}mail.com`;
  let rowName = name;

  if (roll < 0.01) {
    phone = "invalid-phone"; // bad phone format
  } else if (roll < 0.02) {
    email = "not-an-email"; // bad email format
  } else if (roll < 0.03) {
    rowName = ""; // missing name
  }

  rows.push([i, rowName, phone, email].join(","));
}

const outPath = path.join(process.cwd(), outFile);
fs.writeFileSync(outPath, rows.join("\n") + "\n", "utf8");
console.log(`Wrote ${count} rows to ${outPath}`);
