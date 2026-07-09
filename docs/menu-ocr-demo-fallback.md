# Menu OCR Demo Fallback

This note is for the finals demo/video flow only.

PocketBuddy's real menu scanner path tries OCR first. When `DEMO_MODE=true`, the backend has a safe fallback for the demo: if OCR is not configured, fails, or cannot parse the uploaded file, it creates realistic menu candidates from the venue name.

Those items are still saved as `pending_verification`. They do not become trusted recommendations until campus review confirms them.

## Required Setup

Set this in the backend environment:

```env
DEMO_MODE=true
```

Then restart the backend.

## Demo Flow

1. Open PocketBuddy.
2. Go to Dashboard.
3. Open Food.
4. Select Add Menu.
5. Enter a realistic venue name.
6. Upload any sample menu image or PDF under 5 MB.
7. Click Scan menu for review.
8. Open Verify Menu and show the pending candidates.

## Venue Names To Use

Use one of these names during recording:

| Venue name | Example generated items |
| --- | --- |
| `BH-2 Night Canteen` | Egg Paratha, Masala Maggi, Aloo Paratha, Paneer Roll, Tea, Cold Coffee |
| `Main Canteen` | Veg Thali, Rajma Rice, Chole Rice, Paneer Fried Rice, Curd, Tea |
| `Nescafe` | Cold Coffee, Veg Sandwich, Cheese Sandwich, Samosa, Masala Chai, Brownie |
| `Juice Center` | Banana Shake, Oreo Shake, Lemon Soda, Poha, Sprout Salad |
| `Punjabi Dhaba` | Aloo Paratha, Paneer Paratha, Dal Makhani, Butter Roti, Lassi |

If the venue name does not match a known type, PocketBuddy generates a generic snacks menu: Maggi, burger, fries, and lemon soda.

## What To Say In The Demo

Use this wording:

> The scanner reads a menu photo into review candidates. PocketBuddy does not trust OCR blindly; these rows first go to campus verification before they affect recommendations.

Do not say:

> OCR is guaranteed.

Do not say:

> These scanned items are already trusted.

## Why This Is Safe

- It only runs when `DEMO_MODE=true`.
- It is venue-based, not file-name based.
- Uploaded rows remain pending review.
- Trusted food recommendations still use the normal verification path.
