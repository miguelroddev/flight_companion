export type Airport = {
  id: string;
  iata: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
};

export const airports: Airport[] = [
  {
    id: "lis",
    iata: "LIS",
    name: "Humberto Delgado Airport",
    city: "Lisbon",
    lat: 38.7813,
    lng: -9.1359,
  },
  {
    id: "muc",
    iata: "MUC",
    name: "Munich Airport",
    city: "Munich",
    lat: 48.3538,
    lng: 11.7861,
  },
  {
    id: "lhr",
    iata: "LHR",
    name: "Heathrow Airport",
    city: "London",
    lat: 51.4700,
    lng: -0.4543,
  },
  {
    id: "fra",
    iata: "FRA",
    name: "Frankfurt Airport",
    city: "Frankfurt",
    lat: 50.0379,
    lng: 8.5622,
  },
  {
    id: "pek",
    iata: "PEK",
    name: "Beijing Capital International Airport",
    city: "Beijing",
    lat: 40.0799,
    lng: 116.6031,
  },
  {
    id: "sfo",
    iata: "SFO",
    name: "San Francisco International Airport",
    city: "San Francisco",
    lat: 37.6213,
    lng: -122.3790,
  },
  {
    id: "bsb",
    iata: "BSB",
    name: "Presidente Juscelino Kubitschek International Airport",
    city: "Brasília",
    lat: -15.8697,
    lng: -47.9172,
  },
  {
    id: "cpt",
    iata: "CPT",
    name: "Cape Town International Airport",
    city: "Cape Town",
    lat: -33.9715,
    lng: 18.6021,
  },
  {
    id: "syd",
    iata: "SYD",
    name: "Sydney Kingsford Smith Airport",
    city: "Sydney",
    lat: -33.9399,
    lng: 151.1753,
  },
  {
    id: "hnd",
    iata: "HND",
    name: "Tokyo Haneda Airport",
    city: "Tokyo",
    lat: 35.5494,
    lng: 139.7798,
  },
  {
    id: "waw",
    iata: "WAW",
    name: "Warsaw Chopin Airport",
    city: "Warsaw",
    lat: 52.1657,
    lng: 20.9671,
  },
];