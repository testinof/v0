import { type NextRequest, NextResponse } from "next/server";
import { getClientIP, getLocationFromIP, getDeviceInfo } from "@/lib/analytics-utils";
import { Telegraf } from "telegraf";

// Simple in-memory store to track recent events (for development)
// In production, you might want to use a more persistent solution
const recentEvents = new Set<string>();
const EVENT_TIMEOUT = 5000; // 5 seconds

export async function POST(req: NextRequest) {
  try {
    const eventData = await req.json();

    // Check for duplicate events using the unique event ID
    if (eventData._eventId && recentEvents.has(eventData._eventId)) {
      return NextResponse.json({ success: true, message: "Duplicate event ignored" });
    }

    // Store the event ID to prevent duplicates
    if (eventData._eventId) {
      recentEvents.add(eventData._eventId);
      // Clean up old events periodically
      setTimeout(() => {
        recentEvents.delete(eventData._eventId);
      }, EVENT_TIMEOUT);
    }

    // Get client information
    const clientIP = getClientIP(req);
    const locationData = await getLocationFromIP(clientIP);
    const deviceInfo = getDeviceInfo(req);

    // Prepare analytics data
    const timestamp = new Date().toISOString();
    const locationString = `${locationData.city}, ${locationData.region}, ${locationData.country}`;
    
    const analyticsData = {
      timestamp,
      eventType: eventData.eventType || "unknown",
      pageUrl: eventData.pageUrl || "Unknown",
      element: eventData.element || "Unknown",
      ip: clientIP,
      location: locationString,
      userAgent: deviceInfo.userAgent,
      _eventId: eventData._eventId, // Pass through for debugging
    };

    // Send notification to Telegram
    await sendTelegramNotification(analyticsData);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error processing analytics event:", error);
    return NextResponse.json(
      { success: false, message: "Failed to process analytics event" },
      { status: 500 }
    );
  }
}

async function sendTelegramNotification(data: any) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatIdsString = process.env.TELEGRAM_CHAT_IDS;
  
  if (!botToken || !chatIdsString) {
    console.error("Telegram credentials not configured");
    return;
  }

  // Split the comma-separated string into an array of chat IDs
  const chatIds = chatIdsString.split(',');
  
  // Create message based on event type
  let message = "";
  if (data.eventType === "pageview") {
    message = `
🌐 New Page View
────────────────────
📅 Timestamp: ${new Date(data.timestamp).toLocaleString()}
🌍 Location: ${data.location}
🖥️ User Agent: ${data.userAgent.substring(0, 50)}...
📄 Page: ${data.pageUrl}
────────────────────
    `;
  } else if (data.eventType === "click") {
    message = `
🔗 Link Clicked
────────────────────
📅 Timestamp: ${new Date(data.timestamp).toLocaleString()}
🌍 Location: ${data.location}
🖥️ User Agent: ${data.userAgent.substring(0, 50)}...
📄 Page: ${data.pageUrl}
🔗 Element: ${data.element}
────────────────────
    `;
  } else if (data.eventType === "wallet_select") {
    message = `
💼 Wallet Selected
────────────────────
📅 Timestamp: ${new Date(data.timestamp).toLocaleString()}
🌍 Location: ${data.location}
🖥️ User Agent: ${data.userAgent.substring(0, 50)}...

────────────────────
    `;
  } else {
    // Default message for unknown events
    message = `
🔔 Analytics Event
────────────────────
📅 Timestamp: ${new Date(data.timestamp).toLocaleString()}
🌍 Location: ${data.location}
🖥️ User Agent: ${data.userAgent.substring(0, 50)}...
📄 Page: ${data.pageUrl}
🔗 Event Type: ${data.eventType}
🔗 Element: ${data.element}
────────────────────
    `;
  }

  // Ensure message is not empty
  if (!message.trim()) {
    message = "Empty analytics event received";
  }

  try {
    const bot = new Telegraf(botToken);
    
    // Send message to each chat ID
    for (const chatId of chatIds) {
      try {
        await bot.telegram.sendMessage(chatId.trim(), message);
        console.log(`Message sent to chat ID: ${chatId}`);
      } catch (error) {
        console.error(`Error sending to ${chatId}:`, error);
      }
    }
  } catch (error) {
    console.error("Error in Telegram notification function:", error);
  }
}

// GET handler for health check
export async function GET() {
  return NextResponse.json({
    status: "OK",
    message: "Analytics API is running",
    timestamp: new Date().toISOString(),
  });
}