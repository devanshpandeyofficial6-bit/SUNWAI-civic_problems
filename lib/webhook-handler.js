'use strict';

/**
 * webhook-handler.js
 * Omni-channel WhatsApp & Messenger Grievance Ingestion Handler.
 * 
 * Supports standard Twilio WhatsApp Webhooks and Meta Cloud API formats,
 * enabling citizens to lodge grievances by sending a photo and live location pin on WhatsApp.
 */

function parseWhatsAppWebhook(body) {
  // 1. Twilio WhatsApp format
  if (body.From && (body.From.startsWith('whatsapp:') || body.MediaUrl0 || body.Latitude)) {
    const phone = body.From.replace('whatsapp:', '').trim();
    const lat = body.Latitude ? parseFloat(body.Latitude) : null;
    const lng = body.Longitude ? parseFloat(body.Longitude) : null;
    const text = body.Body ? body.Body.trim() : '';
    const mediaUrl = body.MediaUrl0 || null;

    return {
      isValid: Boolean(mediaUrl || text),
      channel: 'whatsapp_twilio',
      senderPhone: phone,
      senderName: body.ProfileName || `WhatsApp Citizen (${phone.slice(-4)})`,
      lat,
      lng,
      description: text || 'Grievance reported via WhatsApp photo submission.',
      mediaUrl,
    };
  }

  // 2. Meta WhatsApp Cloud API format
  if (body.entry && Array.isArray(body.entry)) {
    try {
      const changes = body.entry[0].changes[0].value;
      const message = changes.messages[0];
      const contact = changes.contacts ? changes.contacts[0] : null;

      const phone = message.from;
      const senderName = contact && contact.profile ? contact.profile.name : `Citizen (${phone.slice(-4)})`;

      let lat = null;
      let lng = null;
      let text = '';
      let mediaUrl = null;

      if (message.type === 'location') {
        lat = message.location.latitude;
        lng = message.location.longitude;
      } else if (message.type === 'image') {
        mediaUrl = message.image.id ? `https://meta-media-proxy.sunwai.gov.in/${message.image.id}` : null;
        text = message.image.caption || '';
      } else if (message.type === 'text') {
        text = message.text.body;
      }

      return {
        isValid: Boolean(mediaUrl || text || (lat && lng)),
        channel: 'whatsapp_meta',
        senderPhone: phone,
        senderName,
        lat,
        lng,
        description: text || 'Grievance lodged via WhatsApp Messenger.',
        mediaUrl,
      };
    } catch (e) {
      // Fall through
    }
  }

  // 3. Generic JSON Webhook fallback
  const lat = parseFloat(body.lat || body.latitude);
  const lng = parseFloat(body.lng || body.longitude);
  return {
    isValid: Boolean(body.description || body.photoUrl || body.image_url),
    channel: 'generic_api_webhook',
    senderPhone: body.phone || '+91 98765 43210',
    senderName: body.name || 'Citizen (WhatsApp / API)',
    lat: isNaN(lat) ? 26.4499 : lat,
    lng: isNaN(lng) ? 80.3319 : lng,
    description: body.description || 'Grievance received via omni-channel webhook.',
    mediaUrl: body.photoUrl || body.image_url || body.mediaUrl || null,
  };
}

function generateWhatsAppReply({ ticketId, category, confidence, wardName, appBaseUrl }) {
  const confPct = Math.round((confidence || 0.85) * 100);
  return `🙏 *जन सुनवाई - SUNWAI Civic Redressal*

✅ *Grievance Successfully Registered!*
📌 *Ticket ID:* \`${ticketId}\`
🏷️ *AI Category:* ${category.toUpperCase()} (${confPct}% Confidence)
📍 *Jurisdiction:* ${wardName || 'Ward Assigned'}
⏳ *Resolution SLA:* 48-72 Hours

Track real-time status and officer updates here:
${appBaseUrl}/thankyou.html?id=${ticketId}

_Government of Uttar Pradesh / Kanpur Municipal Corporation_`;
}

module.exports = {
  parseWhatsAppWebhook,
  generateWhatsAppReply,
};
