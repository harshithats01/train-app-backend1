const express = require("express");
const bcrypt = require("bcrypt");
const cors = require("cors");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const otpGenerator = require("otp-generator");
const userModel = require("./models/users");
const Report = require("./models/report");


const app = express();
app.use(express.json());
app.use(cors());

const JWT_SECRET = 'trainapp';

// Connect to MongoDB
mongoose.connect("mongodb+srv://harshitha2001:harsh2001@cluster0.wludpyh.mongodb.net/traindb?retryWrites=true&w=majority&appName=Cluster0")
    .then(() => console.log("Connected to MongoDB"))
    .catch(err => console.error("MongoDB connection error:", err));

let otps = {}; // In-memory storage for OTPs

// Sign-up route
app.post("/signup", async (req, res) => {
    const { name, email, password, phone } = req.body;

    try {
        const existingUser = await userModel.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ status: "error", errorMessage: "Email ID already exists" });
        }

        const existingPhone = await userModel.findOne({ phone });
        if (existingPhone) {
            return res.status(400).json({ status: "error", errorMessage: "Phone number already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new userModel({ name, email, password: hashedPassword, phone });
        await newUser.save();

        // Generate OTP
        const otp = otpGenerator.generate(6, { upperCase: false, specialChars: false });
        otps[email] = otp; // Store OTP in memory

        console.log(`Generated OTP for ${email}: ${otp}`); // Log the OTP

        res.json({ status: "success", message: "OTP sent. Please verify it." });
    } catch (error) {
        res.status(500).json({ status: "error", errorMessage: error.message });
    }
});

// OTP verification route
app.post("/verify-otp", (req, res) => {
    const { email, otp } = req.body;

    if (otps[email] && otps[email] === otp) {
        delete otps[email]; // Remove OTP after successful verification
        return res.json({ status: "success", message: "OTP verified successfully. You can now log in." });
    } else {
        return res.status(400).json({ status: "error", message: "Invalid OTP." });
    }
});

// Token generation function, includes role in token payload
const generateToken = (userId, role) => {
    return jwt.sign({ id: userId, role }, JWT_SECRET, { expiresIn: '2h' });
};

// Middleware to authenticate token and set req.user
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        console.log("Token not found in request headers");
        return res.status(401).json({ message: "Access Denied" });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.error("Token verification failed:", err.message);
            return res.status(403).json({ message: "Invalid Token" });
        }
        req.user = user; // Attach user information to request
        console.log("Token verified successfully for user:", user);
        next();
    });
}

// Sign-in route
app.post('/signin', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await userModel.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const token = generateToken(user._id, user.role); // Pass role to generateToken
        return res.status(200).json({ status: 'success', token, userId: user._id, role: user.role });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Report route
app.post('/report', authenticateToken, async (req, res) => {
    console.log('Report request received:', req.body);

    // Destructure the request body to include new fields
    const { trainName, trainNumber, coachNumber, issue, time, location, trainDetails } = req.body;

    // Validate all required fields
    if (!trainName || !trainNumber || !coachNumber || !issue || !time || !location) {
        console.log('Missing fields in report:', { trainName, trainNumber, coachNumber, issue, time, location });
        return res.status(400).json({ error: "Please provide all required fields." });
    }

    try {
        // Create a new report with the additional fields
        const report = await Report.create({
            trainName,
            trainNumber,
            coachNumber,
            issue,
            time,
            location,
            trainDetails,
            userId: req.user.id
        });
        console.log('Report created successfully:', report);
        res.status(201).json({ message: "Report submitted successfully", report });
    } catch (error) {
        console.error('Error creating report:', error.message);
        res.status(500).json({ error: "Failed to submit report. Please try again." });
    }
});


// Middleware to check if user is admin
function authenticateAdmin(req, res, next) {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ message: "Access Denied: Admins Only" });
    }
}

// Route to get all users (admin only)
app.get('/admin/users', authenticateToken, authenticateAdmin, async (req, res) => {
    try {
        const users = await userModel.find({}, 'name email phone'); // Fetch name, email, and phone fields only
        res.status(200).json(users);
    } catch (error) {
        console.error("Error fetching users:", error.message);
        res.status(500).json({ message: "Failed to retrieve users" });
    }
});

// Route to get all reports (admin only)
app.get('/admin/reports', authenticateToken, authenticateAdmin, async (req, res) => {
    try {
        // Fetch all reports with the specified fields
        const reports = await Report.find({}, 'trainName trainNumber coachNumber issue time location trainDetails userId createdAt')
                                    .populate('userId', 'name email'); // Populate to include user info (optional)
        
        res.status(200).json(reports);
    } catch (error) {
        console.error("Error fetching reports:", error.message);
        res.status(500).json({ message: "Failed to retrieve reports" });
    }
});




app.put('/admin/reports/:id', authenticateToken, authenticateAdmin, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    try {
        const report = await Report.findByIdAndUpdate(id, { status }, { new: true });
        if (!report) return res.status(404).json({ message: "Report not found" });
        res.status(200).json(report);
    } catch (error) {
        console.error("Error updating report status:", error);
        res.status(500).json({ message: "Failed to update report status" });
    }
});


// Route to delete a user (admin only)
app.delete('/admin/users/:id', authenticateToken, authenticateAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        const user = await userModel.findByIdAndDelete(id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        res.status(200).json({ message: "User deleted successfully" });
    } catch (error) {
        console.error("Error deleting user:", error.message);
        res.status(500).json({ message: "Failed to delete user" });
    }
});

// Route to delete a report (admin only)
app.delete('/admin/reports/:reportId', authenticateToken, authenticateAdmin, async (req, res) => {
    const { reportId } = req.params;

    try {
        const deletedReport = await Report.findByIdAndDelete(reportId);
        if (!deletedReport) {
            return res.status(404).json({ message: "Report not found" });
        }
        res.status(200).json({ message: "Report deleted successfully", report: deletedReport });
    } catch (error) {
        console.error("Error deleting report:", error.message);
        res.status(500).json({ message: "Failed to delete report" });
    }
});


// Update report status route (for admin use)
app.put('/api/reports/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
        const report = await Report.findByIdAndUpdate(id, { status }, { new: true });
        if (!report) return res.status(404).json({ message: 'Report not found' });
        res.json(report);
    } catch (error) {
        res.status(500).json({ message: 'Error updating report status' });
    }
});
// Get reports for a specific user
app.get('/api/user-reports', async (req, res) => {
    try {
        const userId = req.user._id;  // Assuming req.user contains the authenticated user's info
        const reports = await Report.find({ userId });
        res.json(reports);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching reports' });
    }
});


app.post('/contact', async (req, res) => {
    const { name, email, message } = req.body;

    // Validate input fields
    if (!name || !email || !message) {
        return res.status(400).json({ status: 'error', message: 'All fields are required.' });
    }

    try {
        // You can integrate email sending here (e.g., using nodemailer) or store the contact info in a database

        // For now, just log the contact info to the console
        console.log('Contact Us Submission:', { name, email, message });

        // Respond with a success message
        res.status(200).json({ status: 'success', message: 'Thank you for contacting us! We will get back to you shortly.' });
    } catch (error) {
        console.error('Error in contact route:', error.message);
        res.status(500).json({ status: 'error', message: 'Failed to process your request. Please try again later.' });
    }
});




// Start the server
app.listen(3030, () => {
    console.log("Server started on port 3030");
});
