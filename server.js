import dotenv from "dotenv";
import app from "./src/app.js";
import connectDB from "./src/config/db.js";
import seedAdminUser from "./src/seeders/admin.seeder.js";

dotenv.config();

const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI;

const startServer = async () => {
  await connectDB(MONGO_URI);

  // Seed admin user
  await seedAdminUser();

  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
};

startServer();
