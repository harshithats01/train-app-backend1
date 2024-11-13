// contactRoute.js (Backend)
const express = require('express');
const router = express.Router();

// Example of storing data in an in-memory array
let contactMessages = [];

router.post('/contact', (req, res) => {
    const { name, email, message } = req.body;

    // You can save this data to your database here
    contactMessages.push({ name, email, message });

    res.status(200).json({ message: 'Message received successfully!' });
});

module.exports = router;
