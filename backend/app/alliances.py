"""Airline alliance membership, and applying it to the airlines table.

Membership is keyed by IATA code rather than by name: the scraped data spells
names its own way ("LOT - Polish Airlines", "ANA", "TAP Portugal"), but every
code maps to exactly one carrier. Each entry still records the name the data
uses, as a guard: a code the scrape later hands to a different airline fails
the name check and is left untagged instead of silently joining an alliance.

Includes full members plus the affiliates that fly under a member's alliance
membership and appear in the data under their own code. Suspended members
(Aeroflot, SU) and "connecting partners" (Juneyao, HO) are deliberately out.

After editing this list, apply it without a re-import:
    docker compose exec backend python -m app.alliances
Deploys apply it automatically (see .github/workflows/deploy.yml).
"""
import re
from typing import Literal

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models import Airline

Alliance = Literal["star_alliance", "oneworld", "skyteam"]
ALLIANCES: tuple[Alliance, ...] = ("star_alliance", "oneworld", "skyteam")

# IATA code -> (alliance, name as it appears in the scraped data)
MEMBERS: dict[str, tuple[Alliance, str]] = {
    # Star Alliance
    "A3": ("star_alliance", "Aegean Airlines"),
    # Aegean subsidiary; its flights are sold under A3 flight numbers. Its own
    # Star status is murky ("connecting partner" by some accounts).
    "OA": ("star_alliance", "Olympic Air"),
    "AC": ("star_alliance", "Air Canada"),
    "CA": ("star_alliance", "Air China"),
    "AI": ("star_alliance", "Air India"),
    "NZ": ("star_alliance", "Air New Zealand"),
    "NH": ("star_alliance", "ANA"),
    # Leaves Star on 16 Dec 2026 and merges into Korean Air (KE, SkyTeam) the
    # next day: delete this line then.
    "OZ": ("star_alliance", "Asiana Airlines"),
    "OS": ("star_alliance", "Austrian Airlines"),
    "AV": ("star_alliance", "AVIANCA"),
    "SN": ("star_alliance", "Brussels Airlines"),
    "CM": ("star_alliance", "Copa Airlines"),
    "OU": ("star_alliance", "Croatia Airlines"),
    "MS": ("star_alliance", "EgyptAir"),
    "ET": ("star_alliance", "Ethiopian Airlines"),
    "BR": ("star_alliance", "EVA Air"),
    "AZ": ("star_alliance", "ITA Airways"),  # left SkyTeam in 2025 for Star
    "LO": ("star_alliance", "LOT - Polish Airlines"),
    "LH": ("star_alliance", "Lufthansa"),
    "EN": ("star_alliance", "Air Dolomiti"),  # Lufthansa affiliate
    "VL": ("star_alliance", "Lufthansa City Airlines"),  # Lufthansa affiliate
    "ZH": ("star_alliance", "Shenzhen Airlines"),
    "SQ": ("star_alliance", "Singapore Airlines"),
    "SA": ("star_alliance", "South African Airways"),
    "LX": ("star_alliance", "SWISS"),
    "TP": ("star_alliance", "TAP Portugal"),
    "TG": ("star_alliance", "Thai Airways International"),
    "TK": ("star_alliance", "Turkish Airlines"),
    "UA": ("star_alliance", "United Airlines"),
    # oneworld
    # Hawaiian (HA) joined as a full member in April 2026 but is absent from
    # the scrape. Philippine Airlines (PR) is a "future member": add it on joining.
    "AS": ("oneworld", "Alaska Airlines"),
    "AA": ("oneworld", "American Airlines"),
    "BA": ("oneworld", "British Airways"),
    "CX": ("oneworld", "Cathay Pacific"),
    "FJ": ("oneworld", "Fiji Airways"),
    "AY": ("oneworld", "Finnair"),
    "IB": ("oneworld", "Iberia"),
    "JL": ("oneworld", "JAL"),
    "NU": ("oneworld", "Japan Transocean Air"),  # JAL affiliate
    "MH": ("oneworld", "Malaysia Airlines"),
    "WY": ("oneworld", "Oman Air"),
    "QF": ("oneworld", "Qantas"),
    "QR": ("oneworld", "Qatar Airways"),
    "AT": ("oneworld", "Royal Air Maroc"),
    "RJ": ("oneworld", "Royal Jordanian"),
    "UL": ("oneworld", "SriLankan Airlines"),
    # SkyTeam
    "AR": ("skyteam", "Aerolineas Argentinas"),
    "AM": ("skyteam", "Aeromexico"),
    "UX": ("skyteam", "Air Europa"),
    "AF": ("skyteam", "Air France"),
    "CI": ("skyteam", "China Airlines"),
    "AE": ("skyteam", "Mandarin Airlines"),  # China Airlines affiliate
    "MU": ("skyteam", "China Eastern Airlines"),
    "FM": ("skyteam", "Shanghai Airlines"),  # China Eastern affiliate
    "DL": ("skyteam", "Delta Air Lines"),
    "GA": ("skyteam", "Garuda Indonesia"),
    "KQ": ("skyteam", "Kenya Airways"),
    "KL": ("skyteam", "KLM"),
    "KE": ("skyteam", "Korean Air"),
    "ME": ("skyteam", "Middle East Airlines"),
    "SV": ("skyteam", "Saudia"),
    "SK": ("skyteam", "Scandinavian Airlines"),  # left Star for SkyTeam in 2024
    "RO": ("skyteam", "TAROM"),
    "VN": ("skyteam", "Vietnam Airlines"),
    "VS": ("skyteam", "Virgin Atlantic"),
    "MF": ("skyteam", "Xiamen Airlines"),
}


def normalize_name(name: str) -> str:
    """Letters and digits only, lowercased, without the generic carrier words,
    so "LOT - Polish Airlines" and "LOT Polish" compare equal."""
    words = re.findall(r"[a-z0-9]+", name.lower())
    generic = {"airlines", "airline", "airways", "air", "lines", "international"}
    return "".join(word for word in words if word not in generic) or "".join(words)


def assign_alliances(db: Session) -> list[str]:
    """Rewrite airlines.alliance from MEMBERS. Returns human-readable problems:
    listed codes missing from the table, and codes whose name no longer matches.
    Does not commit."""
    db.execute(update(Airline).values(alliance=None))

    airlines = {
        code: (airline_id, name)
        for airline_id, code, name in db.execute(
            select(Airline.id, Airline.iata_code, Airline.name)
        ).all()
    }

    problems = []
    for code, (alliance, expected_name) in MEMBERS.items():
        if code not in airlines:
            problems.append(f"{code} ({expected_name}): not in the airlines table")
            continue

        airline_id, name = airlines[code]
        if normalize_name(name) != normalize_name(expected_name):
            problems.append(
                f"{code}: expected {expected_name!r}, found {name!r}; left untagged"
            )
            continue

        db.execute(
            update(Airline).where(Airline.id == airline_id).values(alliance=alliance)
        )
    return problems


def main() -> None:
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        problems = assign_alliances(db)
        db.commit()
        counts = dict(
            db.execute(
                select(Airline.alliance, func.count()).group_by(Airline.alliance)
            ).all()
        )
    finally:
        db.close()

    for alliance in ALLIANCES:
        print(f"{alliance}: {counts.get(alliance, 0)} airlines")
    for problem in problems:
        print(f"  ! {problem}")


if __name__ == "__main__":
    main()
