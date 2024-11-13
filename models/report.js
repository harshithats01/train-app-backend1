const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    trainName: { type: String, required: true },    // Train name field
    trainNumber: { type: String, required: true },  
    coachNumber: { type: String, required: true },
    issue: { type: String, required: true },
    time: { type: String, required: true },
    location: { type: String, required: true },
    trainDetails: { type: String },
    status: { type: String, default: 'Pending' },   // New status field for report tracking
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const Report = mongoose.model('Report', reportSchema);
module.exports = Report;
