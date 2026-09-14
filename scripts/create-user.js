// Adds (or resets the password of) a team member's login directly in the
// database. There is no self-service signup — this is the intended way for
// GlobalVox to provision accounts.
//
// Usage:
//   node scripts/create-user.js <email> <password> ["Full Name"]
//
// Requires DATABASE_URL (and DIRECT_URL) to be set, e.g. via a local .env
// file, same as running the app itself.

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

async function main() {
  const [, , email, password, name] = process.argv;

  if (!email || !password) {
    console.error("Usage: node scripts/create-user.js <email> <password> [\"Full Name\"]");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: { passwordHash, ...(name ? { name } : {}) },
    create: { email: email.toLowerCase(), passwordHash, name: name || null },
  });

  console.log(`OK: ${user.email} (id ${user.id}) is ready to log in.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
