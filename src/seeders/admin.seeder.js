import User from "../models/user.model.js";

//  Create default admin user if not exists
const seedAdminUser = async () => {
  try {
    const adminEmail = "admin@gmail.com";

    const existingAdmin = await User.findOne({ email: adminEmail });

    if (existingAdmin) {
      console.log(" Admin user already exists");
      return;
    }

    await User.create({
      name: "Admin",
      email: adminEmail,
      password: "Sahal@123", 
    });

    console.log("🚀 Admin user created successfully");
  } catch (error) {
    console.error("❌ Error creating admin user:", error.message);
  }
};

export default seedAdminUser;
