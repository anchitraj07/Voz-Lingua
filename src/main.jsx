import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight, Check, ChevronDown, Globe2, GraduationCap,
  MessageCircle, Play, Star, Sparkles, BookOpen, Users, Menu, X
} from "lucide-react";
import "./styles.css";

const courses = [
  { level: "A1", title: "French for Beginners", duration: "8–10 weeks", desc: "Build a strong foundation in pronunciation, vocabulary, grammar and everyday conversation.", tags: ["Beginner", "Live classes", "Speaking"] },
  { level: "A2", title: "Elementary French", duration: "8–10 weeks", desc: "Move beyond the basics and become comfortable handling common real-world situations.", tags: ["Elementary", "Conversation", "Practice"] },
  { level: "B1", title: "Intermediate French", duration: "10–12 weeks", desc: "Develop independent communication skills for work, travel, study and daily life.", tags: ["Intermediate", "Fluency", "Grammar"] },
  { level: "B2", title: "Upper-Intermediate French", duration: "10–12 weeks", desc: "Refine fluency, comprehension and accuracy with advanced communication practice.", tags: ["Advanced", "Fluency", "Writing"] }
];

const faqs = [
  ["I am a complete beginner. Can I join?", "Yes. Our A1 program is designed for learners starting from zero."],
  ["Are classes online or offline?", "VOZ LINGUA is launching with online live classes. Offline and hybrid options can be added as the academy grows."],
  ["Will I learn to speak French?", "Yes. Speaking is built into every lesson through guided conversations, role plays and practical situations."],
  ["Do you prepare students for DELF/TCF/TEF?", "Exam preparation will be offered as a dedicated program. The current focus is building a strong language foundation first."],
  ["Do you offer one-to-one classes?", "Yes. Private sessions can be offered alongside group batches for learners who need a personalized pace."]
];

function App() {
  const [openFaq, setOpenFaq] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [program, setProgram] = useState("A1 — French for Beginners");

  const go = (id) => {
    setMobileOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="site">
      <header className="nav">
        <div className="container nav-inner">
          <button className="brand" onClick={() => go("home")}>
            <span className="brand-mark">V</span>
            <span>VOZ <em>LINGUA</em></span>
          </button>

          <nav className={mobileOpen ? "nav-links open" : "nav-links"}>
            <button onClick={() => go("courses")}>Courses</button>
            <button onClick={() => go("method")}>Our Method</button>
            <button onClick={() => go("about")}>About</button>
            <button onClick={() => go("faq")}>FAQ</button>
            <button className="nav-cta" onClick={() => go("contact")}>Book a Free Demo <ArrowRight size={16} /></button>
          </nav>

          <button className="menu-btn" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Menu">
            {mobileOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      <main>
        <section id="home" className="hero">
          <div className="hero-glow glow-one"></div>
          <div className="hero-glow glow-two"></div>
          <div className="container hero-grid">
            <div className="hero-copy">
              <div className="eyebrow"><Sparkles size={15} /> French learning, made practical</div>
              <h1>Learn French.<br /><span>Speak with confidence.</span></h1>
              <p className="hero-text">
                Structured French programs for beginners, students and professionals.
                Learn the language through real conversations, guided practice and a clear path from A1 to B2.
              </p>
              <div className="hero-actions">
                <button className="primary" onClick={() => go("contact")}>Book a Free Demo <ArrowRight size={18} /></button>
                <button className="secondary" onClick={() => go("courses")}><Play size={16} /> Explore Courses</button>
              </div>
              <div className="trust-row">
                <span><Check size={16} /> Beginner friendly</span>
                <span><Check size={16} /> Speaking focused</span>
                <span><Check size={16} /> Structured curriculum</span>
              </div>
            </div>

            <div className="hero-card-wrap">
              <div className="floating-card top-card">
                <span className="flag">🇫🇷</span>
                <div><strong>Bonjour!</strong><small>Your French journey starts here.</small></div>
              </div>
              <div className="language-card">
                <div className="card-orbit orbit-1"></div>
                <div className="card-orbit orbit-2"></div>
                <div className="language-core">VOZ</div>
                <div className="word word-a">Bonjour</div>
                <div className="word word-b">Parler</div>
                <div className="word word-c">Voyager</div>
                <div className="word word-d">Réussir</div>
              </div>
              <div className="floating-card bottom-card">
                <div className="avatar-stack"><i>V</i><i>L</i><i>F</i></div>
                <div><strong>Learn together</strong><small>Live classes + practice</small></div>
              </div>
            </div>
          </div>
        </section>

        <section className="stats">
          <div className="container stats-grid">
            <div><strong>A1 → B2</strong><span>Structured levels</span></div>
            <div><strong>Live</strong><span>Interactive classes</span></div>
            <div><strong>Practical</strong><span>Real-world French</span></div>
            <div><strong>Personal</strong><span>Guided feedback</span></div>
          </div>
        </section>

        <section id="courses" className="section">
          <div className="container">
            <div className="section-head">
              <div>
                <div className="eyebrow">Our programs</div>
                <h2>A clear path to better French.</h2>
              </div>
              <p>Start at the level that fits you. Each program combines language fundamentals with communication practice.</p>
            </div>

            <div className="course-grid">
              {courses.map((c) => (
                <article className="course-card" key={c.level}>
                  <div className="course-top"><span className="level">{c.level}</span><span className="duration">{c.duration}</span></div>
                  <h3>{c.title}</h3>
                  <p>{c.desc}</p>
                  <div className="tags">{c.tags.map(t => <span key={t}>{t}</span>)}</div>
                  <button onClick={() => go("contact")}>Enquire about this course <ArrowRight size={16} /></button>
                </article>
              ))}
            </div>

            <div className="special-row">
              <div className="special-icon"><MessageCircle /></div>
              <div><strong>Conversation French</strong><p>For learners who want to speak more naturally through guided conversation and real-life scenarios.</p></div>
              <button onClick={() => go("contact")}>Learn more <ArrowRight size={16} /></button>
            </div>
          </div>
        </section>

        <section id="method" className="section method-section">
          <div className="container">
            <div className="method-layout">
              <div>
                <div className="eyebrow">The VOZ Method</div>
                <h2>Don't just study French. <span>Use it.</span></h2>
                <p className="lead">VOZ LINGUA is built around active language use. You learn a concept, practice it, receive feedback and apply it in a real context.</p>
                <button className="primary" onClick={() => go("contact")}>Experience a Demo <ArrowRight size={18} /></button>
              </div>
              <div className="method-steps">
                {[
                  ["L", "Learn", "Build vocabulary and grammar foundations."],
                  ["I", "Interact", "Practice through guided conversations."],
                  ["N", "Notice", "Understand mistakes and improve accuracy."],
                  ["G", "Generate", "Create your own sentences and responses."],
                  ["U", "Use", "Apply French to real situations."],
                  ["A", "Assess", "Measure progress and identify next steps."]
                ].map(([letter, title, text]) => (
                  <div className="method-step" key={letter}>
                    <span>{letter}</span><div><strong>{title}</strong><p>{text}</p></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="about" className="section about-section">
          <div className="container about-grid">
            <div className="about-visual">
              <div className="about-panel">
                <Globe2 size={42} />
                <strong>Language opens worlds.</strong>
                <span>VOZ LINGUA</span>
              </div>
            </div>
            <div>
              <div className="eyebrow">Why VOZ LINGUA</div>
              <h2>A language academy built around the learner.</h2>
              <p>Learning a language can feel overwhelming when lessons are disconnected. VOZ LINGUA gives learners a structured progression, practical communication and continuous feedback.</p>
              <div className="feature-list">
                <div><GraduationCap /><span><strong>Structured learning</strong><small>A clear progression from foundation to fluency.</small></span></div>
                <div><MessageCircle /><span><strong>Communication first</strong><small>Speaking and listening are part of the learning process.</small></span></div>
                <div><Users /><span><strong>Human guidance</strong><small>Instructor-led support instead of learning alone.</small></span></div>
                <div><BookOpen /><span><strong>Useful materials</strong><small>Lessons, exercises and practice designed for real use.</small></span></div>
              </div>
            </div>
          </div>
        </section>

        <section className="section testimonial-section">
          <div className="container">
            <div className="quote">
              <div className="stars">{[1, 2, 3, 4, 5].map(i => <Star key={i} size={17} fill="currentColor" />)}</div>
              <blockquote>“The goal isn't to know more French words. It's to become comfortable using French.”</blockquote>
              <span>— The VOZ LINGUA learning philosophy</span>
            </div>
          </div>
        </section>

        <section id="faq" className="section faq-section">
          <div className="container faq-layout">
            <div><div className="eyebrow">FAQ</div><h2>Questions, answered.</h2><p>Everything you need to know before starting your French learning journey.</p></div>
            <div className="faq-list">
              {faqs.map(([q, a], i) => (
                <div className="faq-item" key={q}>
                  <button onClick={() => setOpenFaq(openFaq === i ? null : i)}><span>{q}</span><ChevronDown className={openFaq === i ? "rotate" : ""} /></button>
                  {openFaq === i && <p>{a}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="contact" className="contact-section">
          <div className="container contact-card">
            <div>
              <div className="eyebrow light">Start your journey</div>
              <h2>Ready to say <em>bonjour</em>?</h2>
              <p>Book a free introductory session and find the right French program for your current level and goals.</p>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              // Replace YOUR_WHATSAPP_NUMBER with your actual phone number including country code (e.g. 919876543210 for India)
              const phoneNumber = "919289731089";
              const message = `Hello! I would like to book a free demo.%0A%0A*Name:* ${name}%0A*Email:* ${email}%0A*Program:* ${program}`;
              window.open(`https://wa.me/${phoneNumber}?text=${message}`, '_blank');
            }}>
              <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name" />
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" aria-label="Email address" />
              <select aria-label="Preferred program" value={program} onChange={(e) => setProgram(e.target.value)}>
                <option value="A1 — French for Beginners">A1 — French for Beginners</option>
                <option value="A2 — Elementary French">A2 — Elementary French</option>
                <option value="B1 — Intermediate French">B1 — Intermediate French</option>
                <option value="B2 — Upper-Intermediate French">B2 — Upper-Intermediate French</option>
                <option value="Conversation French">Conversation French</option>
                <option value="Not sure — help me choose">Not sure — help me choose</option>
              </select>
              <button className="primary light-btn" type="submit">Request Free Demo <ArrowRight size={18} /></button>
            </form>
          </div>
        </section>
      </main>

      <footer>
        <div className="container footer-grid">
          <div><button className="brand footer-brand" onClick={() => go("home")}><span className="brand-mark">V</span><span>VOZ <em>LINGUA</em></span></button><p>French learning, made practical.</p></div>
          <div><strong>Explore</strong><button onClick={() => go("courses")}>Courses</button><button onClick={() => go("method")}>Our Method</button><button onClick={() => go("faq")}>FAQ</button></div>
          <div><strong>Contact</strong><span>India</span><span>Online Classes</span><button onClick={() => go("contact")}>Book a Free Demo</button></div>
        </div>
        <div className="container copyright">© {new Date().getFullYear()} VOZ LINGUA. All rights reserved.</div>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
