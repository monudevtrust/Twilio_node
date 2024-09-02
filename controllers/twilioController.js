const twilio = require('twilio');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();


const {
  TWILIO_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_API_KEY,
  TWILIO_API_SECRET,
  OUTGOING_APPLICATION_SID,
  CALLER_ID,
  HOST
} = process.env;

const client = new twilio(TWILIO_SID, TWILIO_AUTH_TOKEN);

// Generate Twilio Token
exports.generateToken = (req, res) => {
  const identity = req.body.identity;

  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  const token = new AccessToken(TWILIO_SID, TWILIO_API_KEY, TWILIO_API_SECRET, {
    identity: identity,
  });

  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: OUTGOING_APPLICATION_SID,
    incomingAllow: true,
  });

  token.addGrant(voiceGrant);

  res.status(200).json({
    identity: identity,
    token: token.toJwt(),
  });
};

 


exports.voiceCall = async (req, res) => {
    const { To, leadId, assignId, countryCode, phoneNumber } = req.body;

    // Validate required parameters
    if (!To || !leadId || !assignId || !countryCode || !phoneNumber) {
        return res.status(400).json({ success: false, message: 'All parameters are required' });
    }

    // Check if `To` and `CALLER_ID` are the same to avoid infinite loop
    if (To === CALLER_ID) {
        return res.status(400).json({ success: false, message: 'The "To" number cannot be the same as the Twilio "From" number' });
    }

    // Construct the recording callback URL
    const recordingStatusCallbackURL = `${HOST}/recordingCallback/${leadId}/${assignId}/${phoneNumber}/${countryCode}`;

    // Construct the TwiML response with recording configuration
    const response = new twilio.twiml.VoiceResponse();
    response.say("Hello, please wait while we connect your call.");

    const dial = response.dial({
        record: 'true',
        callerId: CALLER_ID,
        recordingStatusCallback: recordingStatusCallbackURL,
        recordingStatusCallbackEvent: 'completed',
        recordingStatusCallbackMethod: 'GET'
    });

    // dial.number(To); // Ensure this line is included to dial the number

    const twiml = response.toString();
    console.log(`Generated TwiML: ${twiml}`);

    // Create the call
    try {
        const call = await client.calls.create({
            to: To,
            from: CALLER_ID,
            twiml: twiml
        });

        console.log(`Call initiated: ${call.sid}`);
        res.status(200).json({ 
            success: true, 
            callSid: call.sid, 
            recordingStatusCallback: recordingStatusCallbackURL // Return the callback URL separately
        });
    } catch (err) {
        console.error(`Error: ${err.message}`);
        res.status(500).json({ success: false, error: err.message });
    }
};

  
// Handle Recording
exports.handleRecording = async (req, res) => {
    const { RecordingSid, LeadId, assignId, phoneNumber, countryCode } = req.body;

    if (!RecordingSid || !LeadId || !phoneNumber || !countryCode) {
        return res.status(400).json({ success: false, message: 'Required parameters missing' });
    }

    try {
        // Fetch the recording details
        const recording = await client.recordings(RecordingSid).fetch();
        const mediaUrl = recording.mediaUrl;

        if (!mediaUrl) {
            return res.status(400).json({ success: false, message: 'Media URL not found' });
        }

        // Download the recording
        const response = await axios.get(mediaUrl, {
            responseType: 'arraybuffer',
            auth: {
                username: TWILIO_SID,
                password: TWILIO_AUTH_TOKEN,
            },
        });

        // Save the recording
        const timestamp = Date.now();
        const filename = `audio_${LeadId}_${timestamp}.mp3`;  // Filename includes LeadId
        const downloadsDir = path.join(__dirname, '../downloads');

        if (!fs.existsSync(downloadsDir)) {
            fs.mkdirSync(downloadsDir);
        }

        const filePath = path.join(downloadsDir, filename);
        fs.writeFileSync(filePath, response.data);

        // Optionally: Save metadata to database
        // OutgoingMessageConversation.create({
        //     assign_id: assignId,
        //     lead_id: LeadId,
        //     from: phoneNumber,
        //     country_code: countryCode,
        //     media_url: `/downloads/${filename}`,
        //     RecordingSid: RecordingSid,
        //     RecordingUrl: mediaUrl,
        //     message_type: 1,
        //     deliver_status: 1,
        // });

        res.status(200).json({
            success: true,
            message: 'Recording saved',
            file: filename,
        });
    } catch (error) {
        console.error('Error fetching recording:', error.response ? error.response.data : error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch recording',
            error: error.response ? error.response.data : error.message
        });
    }
};



exports.getRecording = async (req, res) => {
  const { leadId } = req.query;

  try {
 
    const recordingData = {
      media_url: `http://localhost:3000/downloads/audio_${Date.now()}.mp3`,
      dateCreated: new Date().toISOString(),
    };

    const checkFirstMessage = 0; 

    res.status(200).json({
      success: true,
      data: recordingData,
      checkFirstMessage: checkFirstMessage,
    });

  } catch (error) {
    res.status(400).json({ error: false, data: {}, checkFirstMessage: 0 });
  }
};


async function getRecordingUrl(recordingSid) {
    try {
        // Fetch the recording details
        const recording = await client.recordings(recordingSid).fetch();
        const recordingUrl = recording.mediaUrl;

        // Download the recording
        const response = await axios.get(recordingUrl, {
            responseType: 'arraybuffer',
            auth: {
                username: TWILIO_SID,
                password: TWILIO_AUTH_TOKEN,
            },
        });

        // Save the recording
        const timestamp = new Date().toISOString().replace(/:/g, '').replace(/\..+/, ''); // Format timestamp
        const filename = `audio_${timestamp}.mp3`;
        const downloadDir = path.join(__dirname, '../downloads');

        if (!fs.existsSync(downloadDir)) {
            fs.mkdirSync(downloadDir, { recursive: true });
        }

        const filePath = path.join(downloadDir, filename);
        fs.writeFileSync(filePath, response.data);

        return filename;
    } catch (error) {
        console.error('Error fetching recording:', error.message);
        return '';
    }
}

exports.getRecordingUrl = async (req, res) => {
    const { recordingSid } = req.body;

    if (!recordingSid) {
        return res.status(400).json({ success: false, message: 'RecordingSid is required' });
    }

    try {
        const filename = await getRecordingUrl(recordingSid);

        if (!filename) {
            return res.status(500).json({ success: false, message: 'Failed to save recording' });
        }

        res.status(200).json({
            success: true,
            filename: filename,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error processing request',
            error: error.message,
        });
    }
};