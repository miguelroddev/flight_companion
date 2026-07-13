export type Airport = {
  id: string;
  iata: string;
  name: string;
  city: string;
};

export const airports: Airport[] = [
  {
    id: "lis",
    iata: "LIS",
    name: "Humberto Delgado Airport",
    city: "Lisbon",
  },
  {
    id: "muc",
    iata: "MUC",
    name: "Munich Airport",
    city: "Munich",
  },
  {
    id: "lhr",
    iata: "LHR",
    name: "Heathrow Airport",
    city: "London",
  },
  {
    id: "fra",
    iata: "FRA",
    name: "Frankfurt Airport",
    city: "Frankfurt",
  },
];