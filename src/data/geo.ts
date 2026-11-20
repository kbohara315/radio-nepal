// Automatic visitor country detection based on timezone & free GeoIP lookup.
import { WORLD_COUNTRIES } from './countries'

const TIMEZONE_TO_COUNTRY: Record<string, string> = {
  // South Asia
  'Asia/Kathmandu': 'NP',
  'Asia/Katmandu': 'NP',
  'Asia/Kolkata': 'IN',
  'Asia/Calcutta': 'IN',
  'Asia/Karachi': 'PK',
  'Asia/Dhaka': 'BD',
  'Asia/Colombo': 'LK',
  'Asia/Thimphu': 'BT',
  'Asia/Kabul': 'AF',

  // East & Southeast Asia
  'Asia/Tokyo': 'JP',
  'Asia/Seoul': 'KR',
  'Asia/Shanghai': 'CN',
  'Asia/Chongqing': 'CN',
  'Asia/Urumqi': 'CN',
  'Asia/Hong_Kong': 'HK',
  'Asia/Taipei': 'TW',
  'Asia/Bangkok': 'TH',
  'Asia/Singapore': 'SG',
  'Asia/Kuala_Lumpur': 'MY',
  'Asia/Kuching': 'MY',
  'Asia/Jakarta': 'ID',
  'Asia/Pontianak': 'ID',
  'Asia/Makassar': 'ID',
  'Asia/Jayapura': 'ID',
  'Asia/Manila': 'PH',
  'Asia/Ho_Chi_Minh': 'VN',
  'Asia/Yangon': 'MM',

  // Middle East & Gulf
  'Asia/Dubai': 'AE',
  'Asia/Riyadh': 'SA',
  'Asia/Qatar': 'QA',
  'Asia/Kuwait': 'KW',
  'Asia/Bahrain': 'BH',
  'Asia/Muscat': 'OM',
  'Asia/Jerusalem': 'IL',
  'Asia/Beirut': 'LB',
  'Asia/Amman': 'JO',
  'Asia/Baghdad': 'IQ',

  // Europe
  'Europe/London': 'GB',
  'Europe/Berlin': 'DE',
  'Europe/Paris': 'FR',
  'Europe/Rome': 'IT',
  'Europe/Madrid': 'ES',
  'Europe/Prague': 'CZ',
  'Europe/Vienna': 'AT',
  'Europe/Amsterdam': 'NL',
  'Europe/Brussels': 'BE',
  'Europe/Zurich': 'CH',
  'Europe/Stockholm': 'SE',
  'Europe/Oslo': 'NO',
  'Europe/Copenhagen': 'DK',
  'Europe/Helsinki': 'FI',
  'Europe/Dublin': 'IE',
  'Europe/Lisbon': 'PT',
  'Europe/Warsaw': 'PL',
  'Europe/Budapest': 'HU',
  'Europe/Athens': 'GR',
  'Europe/Bucharest': 'RO',
  'Europe/Sofia': 'BG',
  'Europe/Kyiv': 'UA',
  'Europe/Belgrade': 'RS',
  'Europe/Zagreb': 'HR',
  'Europe/Bratislava': 'SK',
  'Europe/Ljubljana': 'SI',
  'Europe/Tallinn': 'EE',
  'Europe/Riga': 'LV',
  'Europe/Vilnius': 'LT',
  'Europe/Istanbul': 'TR',
  'Europe/Moscow': 'RU',

  // North America
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Los_Angeles': 'US',
  'America/Phoenix': 'US',
  'America/Anchorage': 'US',
  'America/Honolulu': 'US',
  'America/Detroit': 'US',
  'America/Toronto': 'CA',
  'America/Vancouver': 'CA',
  'America/Montreal': 'CA',
  'America/Edmonton': 'CA',
  'America/Winnipeg': 'CA',
  'America/Halifax': 'CA',
  'America/Mexico_City': 'MX',
  'America/Cancun': 'MX',
  'America/Tijuana': 'MX',
  'America/Monterrey': 'MX',

  // South America
  'America/Sao_Paulo': 'BR',
  'America/Rio_de_Janeiro': 'BR',
  'America/Buenos_Aires': 'AR',
  'America/Santiago': 'CL',
  'America/Bogota': 'CO',
  'America/Lima': 'PE',
  'America/Caracas': 'VE',

  // Oceania
  'Australia/Sydney': 'AU',
  'Australia/Melbourne': 'AU',
  'Australia/Brisbane': 'AU',
  'Australia/Adelaide': 'AU',
  'Australia/Perth': 'AU',
  'Australia/Hobart': 'AU',
  'Australia/Darwin': 'AU',
  'Pacific/Auckland': 'NZ',
  'Pacific/Chatham': 'NZ',
  'Pacific/Fiji': 'FJ',

  // Africa
  'Africa/Cairo': 'EG',
  'Africa/Johannesburg': 'ZA',
  'Africa/Lagos': 'NG',
  'Africa/Nairobi': 'KE',
  'Africa/Casablanca': 'MA',
  'Africa/Accra': 'GH',
  'Africa/Addis_Ababa': 'ET',
}

/** Fast, synchronous client country detection from timezone. */
export function detectTimezoneCountry(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz && TIMEZONE_TO_COUNTRY[tz]) {
      return TIMEZONE_TO_COUNTRY[tz]
    }
  } catch {
    // ignore
  }
  return 'NP'
}

/** Optional asynchronous refinement via free GeoIP. */
export async function fetchGeoIpCountry(): Promise<string | null> {
  try {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 3500)
    const res = await fetch('https://ipwho.is/', { signal: ctl.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const data = (await res.json()) as { success?: boolean; country_code?: string }
    if (data.country_code && WORLD_COUNTRIES.some((c) => c.code === data.country_code)) {
      return data.country_code
    }
  } catch {
    // offline or blocked by adblock
  }
  return null
}
