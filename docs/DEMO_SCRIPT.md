# Demo script (under 3 minutes)

Record the real app on a phone (Chrome on Android). At least two thirds of the video is screen recording of the app working.

## Before recording

1. Open the live URL and tap **Use the demo household** (or **Reset** in the demo strip if you have used it before).
2. Turn the phone volume up so the Clerk's voice, the gavel and the stamp are audible.
3. Note who has the gavel on their nameplate: that member is **Speaker this week** and is the only one who can call the vote. The steps below say "the Speaker"; in the seeded household this rotates weekly through Sam, Jo, Maya and Leo.
4. Optional: open the **House** screen and copy the household id for step 6.

## 0:00 to 0:15: title card

One line over the title card:

> "Moot is a parliament for your household. Propose house rules by voice, debate them, vote, and the Clerk keeps the laws and enforces them."

## 0:15 to 0:50: propose and debate

1. Tap **Maya**'s nameplate. Tap **Speak** and say:
   > "I propose movie night every Friday at 5 PM, and I'm voting aye."
2. The Clerk announces the bill ("Order! Maya has introduced The Movie Night Act…"). The Order Paper shows the title and statute text, and Maya's AYE slip drops into her tray.
3. Tap **Leo**. Tap **Speak**:
   > "I think we should get popcorn every time."
   The debate line appears on the Order Paper.

## 0:50 to 1:20: the vote and the stamp

1. Tap the **Speaker**'s nameplate (the one with the gavel). Say:
   > "I call the vote."
   The gavel knocks twice.
2. Vote as each remaining member: tap the nameplate, tap Speak, say **"Aye"** (or "Nay" for one member to make it interesting). Ballot slips fill the trays.
3. As any member, say:
   > "Close the vote."
   The Clerk reads the roll call: "Order! The ayes, 3. The noes, 1. The ayes have it!"
4. Because Maya is a child, the bill waits for Parental Assent. Tap **Sam** and say:
   > "I give assent."
   The **ENACTED** stamp thuds onto the Order Paper.

(To skip the assent beat, switch Parental Assent off on the **House** screen before recording; the stamp then lands straight after the roll call.)

## 1:20 to 1:50: proactive reminder

1. In the demo strip, tap **Fri 5 PM**.
2. The clock jumps to Friday 5:00 PM and the Clerk proactively reminds the household under The Movie Night Act, citing the act.

## 1:50 to 2:15: a ruling

1. Tap **Leo** and say:
   > "Can I wear shoes in the house?"
2. The Clerk rules under The Shoes Off Act, citing its act and the date it was enacted.

## 2:15 to 2:45: the real MCP server

In a terminal (screen-record it), run:

```bash
npm run mcp:smoke -- https://YOUR-APP.vercel.app hh_YOUR_HOUSEHOLD_ID check_rule '{"member":"Leo","question":"Can I wear shoes inside?"}'
```

It prints the negotiated protocol version (`2025-11-25`), the `tools/list` result, and a `tools/call` result. Or show the same in the MCP Inspector.

Say plainly:

> "The voice front end is a simulated Alexa+ experience. Every action it takes goes through this real MCP server, which any MCP client can call."

## 2:45 to 3:00: close

Open the **Statutes** screen and tap The Movie Night Act to show its history: who proposed it, the roll call, the debate. End on the tagline: *Every household deserves a parliament.*
