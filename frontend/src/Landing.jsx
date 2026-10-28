import { useEffect, useState } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";

const DISTRICT_COUNT = 13;
const DISTRICTS = [
  ["Almora", 29.5971, 79.6591], ["Bageshwar", 29.8383, 79.7716], ["Chamoli", 30.401, 79.321],
  ["Champawat", 29.336, 80.091], ["Dehradun", 30.3165, 78.0322], ["Haridwar", 29.9457, 78.1642],
  ["Nainital", 29.3919, 79.4542], ["Pauri Garhwal", 30.146, 78.779], ["Pithoragarh", 29.5828, 80.2182],
  ["Rudraprayag", 30.2844, 78.9811], ["Tehri Garhwal", 30.378, 78.48], ["Udham Singh Nagar", 28.974, 79.397],
  ["Uttarkashi", 30.7268, 78.4354],
];

function VolunteerArrow() {
  // Looping squiggle-to-arrowhead, same device as the reference nav link:
  // the path stays put, only the arrowhead nudges forward and back.
  return (
    <svg className="volunteer-arrow" width="42" height="24" viewBox="0 0 42 24" fill="none" aria-hidden="true">
      <path d="M1.5 16.5c5.5-8.5 11-13.2 17.2-12.8 6.5.4 9.3 7 5.2 11.6-3.7 4.1-11.7 2.8-12-3.1-.3-5.3 6.6-9.2 13.2-7.9 5.5 1.1 9.4 3.4 14.2 6.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <g className="volunteer-arrow-head">
        <path d="M34.5 6.8 40.5 11l-6 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    </svg>
  );
}

const WHAT_WE_DO = [
  {
    title: "Citizen reporting",
    body: "Anyone can drop a pin on the map and report a landslide, flood, cloudburst or road blockage in seconds, no login needed.",
  },
  {
    title: "Live sensor network",
    body: "Rainfall, soil-moisture and river-level sensors across hill and rural blocks raise an incident automatically the moment a threshold is crossed, often before a single call comes in.",
  },
  {
    title: "Coordinated response",
    body: "District control rooms see every incident the moment it's raised, assign the nearest response team, and track it through a 6-stage pipeline from Reported to Resolved.",
  },
];

const EMERGENCY_NUMBERS = [
  { label: "National Emergency Number", value: "112" },
  { label: "Uttarakhand State Emergency Operation Centre (toll-free)", value: "1070" },
  { label: "State EOC (landline)", value: "0135-2710334" },
  { label: "District Emergency Operation Centre", value: "1077" },
  { label: "Ambulance", value: "108" },
  { label: "Fire", value: "101" },
  { label: "Police", value: "100" },
];

const FUND_ALLOCATION = [
  { label: "Sensor network & equipment upkeep", pct: 40 },
  { label: "Field team training & rescue gear", pct: 30 },
  { label: "Emergency relief kits for affected families", pct: 20 },
  { label: "Platform & day-to-day operations", pct: 10 },
];

export default function Landing({ onReport, onEnter }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="landing" id="home">
      <header className={scrolled ? "landing-nav scrolled" : "landing-nav"}>
        <div className="landing-brand"><span className="brand-mark">+</span><span>Public Rescue</span></div>
        <a className="volunteer-link" href="#volunteer">
          <VolunteerArrow />
          Become a volunteer
        </a>
        <nav className="landing-links" aria-label="Primary">
          <a href="#home">Home</a>
          <a href="#about">About</a>
          <a href="#contact">Contact</a>
          <a href="#donate">Donate</a>
        </nav>
        <div className="landing-nav-actions">
          <button type="button" className="link-button" onClick={onEnter}>Control room</button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">District response network · Uttarakhand</p>
          <h1>When the hills turn dangerous, minutes decide outcomes.</h1>
          <p className="hero-sub">
            Public Rescue links citizens, field sensors and district response teams across
            Uttarakhand's hill and rural blocks, so a landslide, flash flood or cloudburst
            gets a team moving before it becomes a tragedy.
          </p>
          <div className="hero-actions">
            <button type="button" className="hero-cta primary" onClick={onReport}>Report an incident</button>
          </div>
          <dl className="hero-stats">
            <div><dt>{DISTRICT_COUNT}</dt><dd>districts monitored</dd></div>
            <div><dt>24/7</dt><dd>sensor network</dd></div>
            <div><dt>6-stage</dt><dd>response pipeline</dd></div>
          </dl>
        </div>
      </section>

      <section className="landing-map-section" id="coverage">
        <div className="landing-map-copy">
          <p className="eyebrow">Statewide coverage</p>
          <h2>One view for every district response team.</h2>
          <p className="section-sub">Explore the Uttarakhand response network. Public users can report an incident from the map, while control-room teams coordinate the response from the dashboard.</p>
          <div className="feature-links" aria-label="Public Rescue features">
            <a href="#about"><span>01</span><strong>Overview</strong><small>How Public Rescue connects people, sensors and teams</small></a>
            <a href="#contact"><span>02</span><strong>Incidents</strong><small>Report a danger location without creating an account</small></a>
            <a href="#coverage"><span>03</span><strong>District network</strong><small>View coverage across all 13 Uttarakhand districts</small></a>
          </div>
        </div>
        <MapContainer center={[30.15, 79.25]} zoom={7} scrollWheelZoom={false} className="landing-map">
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {DISTRICTS.map(([name, lat, lng]) => <CircleMarker key={name} center={[lat, lng]} radius={6} pathOptions={{ color: "#fff", weight: 2, fillColor: "#c8321e", fillOpacity: 0.9 }}><Tooltip>{name} district response coverage</Tooltip></CircleMarker>)}
        </MapContainer>
      </section>

      <section id="about" className="landing-section">
        <p className="eyebrow">What we do</p>
        <h2>From the first sign of danger to a team on the ground.</h2>
        <p className="section-sub">
          Public Rescue is a disaster-response platform built for Uttarakhand's hill and rural
          blocks, where a landslide-blocked road or a sudden cloudburst can cut a village off
          from help in minutes. It connects three things that usually don't talk to each other:
          the people on the ground, the sensors watching the terrain, and the teams who respond.
        </p>
        <div className="about-grid">
          {WHAT_WE_DO.map((item) => (
            <div className="about-card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="contact" className="landing-section landing-section-alt">
        <p className="eyebrow">Contact · Emergency numbers</p>
        <h2>If someone is in danger right now, call — don't wait on the website.</h2>
        <p className="section-sub">
          This platform supports district response coordination. For an immediate, life-threatening
          emergency, use the numbers below first.
        </p>
        <ul className="numbers-list">
          {EMERGENCY_NUMBERS.map((n) => (
            <li key={n.label}>
              <span>{n.label}</span>
              <a href={`tel:${n.value.replace(/[^\d]/g, "")}`}>{n.value}</a>
            </li>
          ))}
        </ul>
        <p className="numbers-note">
          Numbers sourced from the Uttarakhand State Disaster Management Authority. Please verify
          with your local district office, as helpline numbers can change.
        </p>
      </section>

      <section id="donate" className="landing-section">
        <p className="eyebrow">Donate</p>
        <h2>What a contribution to Public Rescue actually funds.</h2>
        <p className="section-sub">
          We run on a mix of field equipment, trained volunteers and always-on infrastructure.
          Here's roughly how a typical contribution is put to use. <em>(Sample figures — swap in
          your organisation's real, audited breakdown before this goes live.)</em>
        </p>
        <div className="fund-bars">
          {FUND_ALLOCATION.map((f) => (
            <div className="fund-row" key={f.label}>
              <div className="fund-row-top"><span>{f.label}</span><span>{f.pct}%</span></div>
              <div className="fund-bar"><div className="fund-bar-fill" style={{ width: `${f.pct}%` }} /></div>
            </div>
          ))}
        </div>
        <button type="button" className="hero-cta primary" disabled title="Payment gateway not connected yet">
          Donate now
        </button>
        <p className="numbers-note">Online payments aren't connected yet — this button is a placeholder.</p>
      </section>
    </div>
  );
}
