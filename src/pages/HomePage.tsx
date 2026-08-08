import { Link } from "react-router";
import heroImage from "../assets/branding/hero.png";
import "./HomePage.css";

function HomePage() {
  return (
    <>
      <main>
        <section id="center">
          <img
            src={heroImage}
            alt="Stylized world map with flight paths connecting several cities"
            className="hero-image"
          />

          <div className="intro-text">
            <h1>Welcome to Flight Companion!</h1>
            <p>The best flight tool for flight enthusiasts</p>
          </div>
        </section>

        <section id="enter-page">
          <Link className="enter-button" to="/map">
            Enter Here
          </Link>
        </section>

        <section id="next-steps">
          <div id="social">
            <svg className="icon" role="presentation" aria-hidden="true">
              <use href="/icons.svg#social-icon" />
            </svg>

            <h2>Connect with us</h2>

            <p>Contribute to the best open source flight tool</p>

            <ul>
              <li>
                <a
                  href="https://github.com/miguelroddev/flight_companion"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <svg
                    className="button-icon"
                    role="presentation"
                    aria-hidden="true"
                  >
                    <use href="/icons.svg#github-icon" />
                  </svg>

                  GitHub
                </a>
              </li>

              <li>
                <a
                  href="https://flightcompanion.miguelrodrigues.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <svg
                    className="button-icon"
                    role="presentation"
                    aria-hidden="true"
                  >
                    <use href="/icons.svg#visit-site-icon" />
                  </svg>

                  Visit live site
                </a>
              </li>
            </ul>
          </div>
        </section>

        <div className="ticks" />

        <div id="spacer" />
      </main>
    </>
  );
}

export default HomePage;
