"use client";
import type { BillView, MemberView } from "@/lib/client/useMoot";
import { GavelIcon } from "./icons";

interface Seat {
  member: MemberView;
  x: number; // percent of width
  y: number; // percent of height
}

/** Places members on one ring (up to 5) or two rows (6 to 8), left to right in seat order. */
export function seatLayout(members: MemberView[]): Seat[] {
  const n = members.length;
  const rows = n > 5 ? [members.slice(0, Math.ceil(n / 2)), members.slice(Math.ceil(n / 2))] : [members];
  const radii = rows.length === 2 ? [{ rx: 41, ry: 74 }, { rx: 22, ry: 40 }] : [{ rx: 38, ry: 66 }];
  const seats: Seat[] = [];
  rows.forEach((row, r) => {
    row.forEach((member, i) => {
      const angle = Math.PI - ((i + 0.5) * Math.PI) / row.length;
      seats.push({
        member,
        x: 50 + radii[r].rx * Math.cos(angle),
        y: 86 - radii[r].ry * Math.sin(angle),
      });
    });
  });
  return seats;
}

function tilt(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return `${(Math.abs(h) % 9) - 4}deg`;
}

export function Hemicycle({
  members,
  speakerId,
  speakingAs,
  bill,
  onSelect,
}: {
  members: MemberView[];
  speakerId: string | null;
  speakingAs: string | null;
  bill: BillView | null;
  onSelect: (id: string) => void;
}) {
  const seats = seatLayout(members);
  const speaker = members.find((m) => m.id === speakerId);
  const many = members.length > 5;
  const showVotes = bill && bill.status !== "withdrawn";
  return (
    <div
      className="chamber"
      role="group"
      aria-label="The Chamber. Tap a nameplate to speak as that member."
      style={{ ["--plate-w" as string]: many ? "70px" : "84px", ["--plate-font" as string]: many ? "0.85rem" : "1rem" }}
    >
      <div className="chamber__well" aria-hidden="true" />
      {seats.map(({ member, x, y }) => {
        const vote = showVotes ? bill.votes.find((v) => v.member_id === member.id) : undefined;
        const isSpeaker = member.id === speakerId;
        return (
          <div key={member.id} className="seat" style={{ left: `${x}%`, top: `${y}%` }}>
            <button
              type="button"
              className="plate"
              aria-pressed={speakingAs === member.id}
              aria-label={`Speak as ${member.name}${isSpeaker ? ", the Speaker" : ""}${vote ? `, voted ${vote.choice}` : ""}`}
              style={{ ["--member" as string]: member.color }}
              onClick={() => onSelect(member.id)}
            >
              {isSpeaker && <GavelIcon className="plate__gavel" />}
              <span className="plate__name">{member.name}</span>
              <span className="plate__kind">{member.kind}</span>
            </button>
            <div className="tray" aria-hidden="true">
              {vote && (
                <span
                  key={`${bill!.id}-${vote.choice}`}
                  className={`slip slip--${vote.choice}`}
                  style={{ ["--tilt" as string]: tilt(member.id + bill!.id) }}
                >
                  {vote.choice === "abstain" ? "·" : vote.choice.toUpperCase()}
                </span>
              )}
            </div>
          </div>
        );
      })}
      <div className="chair">
        <div className="chair__dais" aria-hidden="true">
          <GavelIcon />
        </div>
        <span className="chair__label">Speaker this week</span>
        <span className="chair__name">{speaker?.name ?? "Vacant"}</span>
      </div>
    </div>
  );
}
