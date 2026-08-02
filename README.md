https://flightcompanion.miguelrodrigues.dev/

# ✈️ Flight Companion

Flight Companion is a full-stack web application for exploring airports, flight routes, and possible connections on an interactive world map.

The goal of the project is to build a clean, maintainable flight-discovery tool inspired by platforms such as FlightConnections, while using the project as a practical way to learn modern web development, full-stack architecture, cloud deployment, and geospatial UI development.

## 🎯 Project Goals

The main goals of Flight Companion are:

* Build a responsive React + TypeScript frontend.
* Render an interactive 2D world map using MapLibre.
* Allow users to search for departure and arrival airports.
* Display flight connections visually on the map.
* Store structured airport, airline, route, and user-related data in a relational SQL database.
* Expose backend functionality through a REST API.
* Integrate external flight or aviation APIs where useful.
* Containerize the frontend and backend using Docker.
* Deploy the application using AWS infrastructure.
* Keep the architecture simple, maintainable, and extensible.

## 🛠️ Tech Stack

### 🎨 Frontend

* React
* TypeScript
* Vite
* React Router
* MapLibre GL
* CSS

Node.js is used for frontend tooling only, including npm, Vite, TypeScript compilation, and the React development server. The application backend is planned to be implemented separately using Python and FastAPI.

### ⚙️ Backend

Planned backend stack:

* Python
* FastAPI
* Pydantic for request and response validation
* REST API architecture
* PostgreSQL integration

### 🗄️ Database

Planned database:

* PostgreSQL

Expected database responsibilities:

* Store airports
* Store airlines
* Store flight routes
* Store user-defined or pinned locations
* Support efficient route and airport queries

### ☁️ Infrastructure

Planned infrastructure:

* Docker
* Docker Compose
* Separate frontend and backend containers
* Python FastAPI backend container
* React/Vite frontend container
* PostgreSQL database, likely hosted through AWS-managed infrastructure
* AWS hosting and deployment

## ✅ Implemented Features

### Frontend Foundation

* Created a Vite React TypeScript application.
* Configured Docker Compose for local development.
* Added React Router for page navigation.
* Built an initial home page.
* Added a dedicated map page.
* Integrated MapLibre as the map-rendering engine.

### Map Page

* Full-screen interactive map.
* 2D map configuration.
* Floating navigation bar.
* Initial search fields for departure and arrival airports.

### Airport Search

* Created a reusable airport search input component.
* Added local airport data.
* Implemented filtering based on IATA code, airport name, and city.
* Added suggestion dropdown behavior.
* Added selected-airport state handling.

## 🚧 Planned Features

### Map and Route Visualization

* Display selected departure and arrival airports on the map.
* Draw route lines between airports.
* Support direct route visualization.
* Add route highlighting.
* Add map camera movement when airports are selected.
* Support airport markers and route layers.

### Airport Search Improvements

* Improve autocomplete UX.
* Add keyboard navigation for suggestions.
* Add better accessibility support.
* Add validation for invalid airport selections.
* Support searching by city, airport name, IATA code, and country.

### Backend API

Planned REST endpoints include:

```text
GET /api/airports
GET /api/airports/{iata}
GET /api/airports/{iata}/routes
GET /api/routes?from=LIS&to=MUC
GET /api/airlines/{code}
POST /api/pinned-locations
```

### Database Design

Planned relational entities:

* Airports
* Airlines
* Routes
* Countries
* User-pinned locations
* External API metadata

Possible initial schema:

```text
airports
- id
- iata_code
- icao_code
- name
- city
- country
- latitude
- longitude

airlines
- id
- iata_code
- icao_code
- name

routes
- id
- source_airport_id
- destination_airport_id
- airline_id
```

### External API Integration

Potential uses of external APIs:

* Enrich airport data.
* Fetch route data.
* Fetch airline metadata.
* Validate or update flight information.
* Supplement manually stored data.

Public APIs that do not require private credentials may be called directly from the frontend when CORS and rate limits allow it. APIs requiring paid or private credentials should be accessed through the FastAPI backend so that secrets are not exposed in browser code.

### Deployment

Planned deployment goals:

* Containerized frontend.
* Containerized backend.
* SQL database instance.
* AWS-based hosting.
* Environment-based configuration.
* Secure handling of API keys.
* Production build pipeline.

## 🏗️ Architecture Direction

The intended architecture is:

```text
React + TypeScript frontend
        ↓ HTTP/JSON
Python FastAPI backend
        ↓ SQL
PostgreSQL database
        ↓
External aviation APIs where needed
```

The frontend is responsible for:

* User interface
* Map interactions
* Search inputs
* Client-side state
* Calling backend API endpoints

The backend is responsible for:

* API request handling
* Database access
* Request and response validation
* External aviation API integration
* Protecting private API keys
* Preventing paid or secret API credentials from being exposed in frontend code
* Business logic

The database is responsible for:

* Persistent structured data
* Relational modeling
* Route and airport queries
* Data integrity

## 🔐 Security Direction

The frontend should not contain private API keys, paid API credentials, or database credentials.

Public APIs may be called directly from the browser when appropriate. Private or paid APIs should be accessed through the backend, where credentials can be stored securely as environment variables and protected by server-side validation, rate limiting, and access control.

The database should only be accessed through the backend API. The React frontend should never connect directly to the SQL database.

## 🧭 Development Philosophy

This project prioritizes:

* Simplicity over unnecessary abstraction.
* Incremental development.
* Clean separation between frontend, backend, and database responsibilities.
* Maintainable code structure.
* Learning through practical implementation.
* Avoiding premature complexity.

## 💻 Local Development

The current development setup runs the React/Vite frontend inside a Docker container. The backend and database containers are planned future additions.

Start the frontend development environment with:

```bash
docker compose up
```

Install frontend dependencies inside the Docker environment with:

```bash
docker compose run --rm app npm install
```

Run a frontend production build with:

```bash
docker compose run --rm app npm run build
```

## 🗺️ Roadmap

### Phase 1 — Frontend Foundation

* [x] Set up React + TypeScript + Vite
* [x] Configure Docker Compose
* [x] Add React Router
* [x] Create home page
* [x] Create map page
* [x] Integrate MapLibre

### Phase 2 — Search and Local Data

* [x] Add airport search component
* [x] Add local airport data
* [x] Improve autocomplete behavior
* [ ] Add keyboard navigation
* [x] Add selected airport markers
* [x] Draw initial route lines

### Phase 3 — Python FastAPI Backend

* [ ] Create FastAPI backend service
* [ ] Add REST API endpoints
* [ ] Add Pydantic request and response models
* [ ] Add request validation
* [ ] Connect backend to PostgreSQL database
* [ ] Add route and airport queries
* [ ] Add secure external API integration

### Phase 4 — Database

* [ ] Design relational schema
* [ ] Add airport table
* [ ] Add airline table
* [ ] Add route table
* [ ] Add indexes for search and route queries
* [ ] Seed initial data

### Phase 5 — External APIs

* [ ] Evaluate aviation API options
* [ ] Add backend integration for external APIs
* [ ] Add caching where appropriate
* [ ] Secure private API keys

### Phase 6 — Deployment

* [ ] Add production Docker configuration
* [ ] Deploy React frontend
* [ ] Deploy FastAPI backend
* [ ] Deploy PostgreSQL database
* [ ] Configure environment variables
* [ ] Secure API keys and backend secrets
* [ ] Deploy on AWS
* [ ] Add monitoring and logging

## 📚 Learning Goals

This project is also intended as a learning project for:

* React component architecture
* TypeScript frontend development
* CSS layout and responsive UI
* MapLibre and geospatial interfaces
* Python FastAPI backend development
* REST API design
* Relational database modeling
* Docker-based development workflows
* AWS deployment
* Secure API-key handling

## 📄 License

This project is currently under development.
