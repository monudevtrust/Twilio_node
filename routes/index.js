const express = require('express');
const router = express.Router();
const twilioController = require('../controllers/twilioController');

 
router.post('/token', twilioController.generateToken);
router.post('/voice', twilioController.voiceCall); 
router.post('/recording', twilioController.handleRecording); 
router.get('/recording', twilioController.getRecording);
router.get('/recordingUrl', twilioController.getRecordingUrl);


module.exports = router;
