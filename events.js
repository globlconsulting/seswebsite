import { db } from './firebase.js';
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// FALLBACK DEFAULT EVENT CONFIGURATION
const fallbackEvent = {
  id: "default-la-sports-event",
  title: "The Golden Era of LA Sports!",
  date: "Tuesday, August 4, 2026 • 11:00 AM - 1:00 PM",
  location: "The LAB Inc., 15916 Crenshaw Blvd, Gardena, CA 90249",
  overview: "Leveraging the Olympics, Super Bowl, World Cup, and more into Lasting Economic and Social Impact. SOCIETY LA: Leveraging Sports Moments into Lasting Momentum",
  cohosts: "Profluence & Playing For Keeps Foundation",
  ticketPrice: "Free",
  imageUrl: "https://www.eventbrite.com/e/_next/image?url=https%3A%2F%2Fimg.evbuc.com%2Fhttps%253A%252F%252Fcdn.evbuc.com%252Fimages%252F1188637605%252F636362833813%252F1%252Foriginal.20260710-202211%3Fcrop%3Dfocalpoint%26fit%3Dcrop%26w%3D1880%26auto%3Dformat%252Ccompress%26q%3D75%26sharp%3D10%26fp-x%3D0.5%26fp-y%3D0.5%26s%3D41ef85234ac8bc4a05be6d9eaf8a4f07&w=1880&q=75",
  rsvpUrl: "https://www.eventbrite.com/e/the-golden-era-of-la-sports-tickets-1992395365171",
  description: `Los Angeles is experiencing an unprecedented era in sports.

With the Olympics, FIFA World Cup, Super Bowl, NBA All-Star Weekend, and other major sporting events converging on our city, the opportunities for business leaders, entrepreneurs, athletes, creators, and community builders have never been greater.

Join us for an exclusive networking event and live fireside chats featuring some of LA's most impactful leaders in Sports & Entertainment as we explore how to turn today's sports moments into lasting momentum for our businesses, careers, organizations, and communities.

What to Expect:
- High-impact networking with professionals across sports, entertainment, media, business, and entrepreneurship
- Live fireside conversations with influential industry leaders
- Insights on the economic, cultural, and business impact of major sporting events coming to Los Angeles
- Actionable strategies for leveraging opportunities created by this historic sports era
- Meaningful connections and collaboration opportunities

Featured Speakers:
- 1 on 1 Conversation: Erikk Aldridge (VP of Impact & Legacy-LA28) & Kofi Nartey (CEO-GLOBL)
- Panel Discussion: Steven Graciano (SVP, Sports Strategy - Canvas Worldwide), Dr. Mimi Nartey (Co-Founder Nartey Sports Foundation. President - Playing For Keeps), Josh Boren (Managing Dir. Strategic Initiatives - RCLCO).
- Moderator: Brandon Leopoldus (Leopoldus Law / Sports Lawyers Association)

Agenda:
- 11:00 AM - 11:30 AM: Arrival & Networking
- 11:30 AM - 12:00 PM: 1 on 1 Conversation w/ Erikk Aldridge & Kofi Nartey
- 12:00 PM - 12:30 PM: Panel Discussion w/ Steven Graciano, Dr. Mimi Nartey, and Josh Boren. Moderated by Brandon Leopoldus.
- 12:30 PM - 1:00 PM: Networking & Wrap-up`
};

document.addEventListener('DOMContentLoaded', async () => {
  const listContainer = document.getElementById('events-list-container');
  const rsvpModal = document.getElementById('rsvp-modal-overlay');
  const rsvpCloseBtn = document.getElementById('rsvp-modal-close');
  const rsvpForm = document.getElementById('rsvp-form');
  const rsvpNotification = document.getElementById('rsvp-notification');

  let activeEvents = [];

  // 1. Fetch events from Firestore
  try {
    const q = query(collection(db, "events"), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    
    querySnapshot.forEach((doc) => {
      activeEvents.push({ id: doc.id, ...doc.data() });
    });
  } catch (err) {
    console.error("Firestore events fetch error, falling back to static", err);
  }

  // Use fallback if no events exist in the database
  if (activeEvents.length === 0) {
    activeEvents = [fallbackEvent];
  }

  // 2. Render events
  renderEventsList(activeEvents, listContainer);

  // 3. Setup event listeners
  rsvpCloseBtn.addEventListener('click', closeRSVPModal);
  rsvpModal.addEventListener('click', (e) => {
    if (e.target === rsvpModal) closeRSVPModal();
  });

  rsvpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    rsvpNotification.style.display = 'none';

    const eventId = document.getElementById('rsvp-event-id').value;
    const eventName = document.getElementById('rsvp-event-name').value;
    const fullName = document.getElementById('rsvp-name').value.trim();
    const email = document.getElementById('rsvp-email').value.trim();

    if (!fullName || !email) {
      showModalMessage('Please fill out all fields.', 'error');
      return;
    }

    const submitBtn = rsvpForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'SUBMITTING...';

    try {
      // Save RSVP to Firestore
      await addDoc(collection(db, "rsvps"), {
        eventId,
        eventName,
        fullName,
        email,
        createdAt: serverTimestamp()
      });

      showModalMessage(`Success! You have RSVP'd for "${eventName}". We look forward to seeing you there!`, 'success');
      rsvpForm.reset();
      
      setTimeout(() => {
        closeRSVPModal();
      }, 3500);

    } catch (err) {
      console.error("RSVP submission failed", err);
      showModalMessage('An error occurred. Please try again later or contact support.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });

  // Render function
  function renderEventsList(events, container) {
    if (!container) return;
    container.innerHTML = '';

    events.forEach(ev => {
      const card = document.createElement('div');
      card.className = 'event-card reveal';
      card.id = `event-card-${ev.id}`;

      // Convert newlines in description to HTML list/paragraphs
      const parsedDesc = ev.description ? ev.description
        .replace(/\n/g, '<br>')
        .replace(/### (.*?)(<br>|$)/g, '<h3>$1</h3>')
        .replace(/- (.*?)(<br>|$)/g, '<li>$1</li>')
        : '';

      const cohostsText = ev.cohosts ? `<div class="event-meta-item"><span class="icon">👥</span><span>Co-Hosted By: ${ev.cohosts}</span></div>` : '';
      const imageStyle = ev.imageUrl ? `background-image: url('${ev.imageUrl}');` : 'background-color: var(--color-blue);';

      const rsvpBtnHtml = ev.rsvpUrl
        ? `<a href="${ev.rsvpUrl}" target="_blank" class="btn btn-primary" style="margin-top: 2rem; width: 100%; display: block; text-align: center; text-decoration: none; box-sizing: border-box; line-height: 1.5; padding: 12px 0;">RSVP TODAY</a>`
        : `<button class="btn btn-primary rsvp-trigger-btn" data-id="${ev.id}" data-title="${ev.title.replace(/"/g, '&quot;')}" style="margin-top: 2rem; width: 100%;">RSVP TODAY</button>`;

      card.innerHTML = `
        <div class="event-image-container" style="${imageStyle}"></div>
        <div class="event-content">
          <div>
            <div class="event-tag-container">
              <span class="event-badge badge-date">📅 UPCOMING</span>
              <span class="event-badge badge-price">${ev.ticketPrice || 'Free'}</span>
            </div>
            <h2 class="event-title">${ev.title}</h2>
            <div class="event-meta">
              <div class="event-meta-item"><span class="icon">🕒</span><span>${ev.date}</span></div>
              <div class="event-meta-item"><span class="icon">📍</span><span>${ev.location}</span></div>
              ${cohostsText}
            </div>
            <p class="event-overview">${ev.overview}</p>
            
            <button class="event-details-toggle" data-id="${ev.id}">
              <span>View Agenda & Full Details</span> <span class="arrow">▼</span>
            </button>
            
            <div class="event-full-details" id="details-${ev.id}">
              ${parsedDesc}
            </div>
          </div>
          ${rsvpBtnHtml}
        </div>
      `;

      container.appendChild(card);
    });

    // Add scroll reveal listeners manually if not already running
    if (window.innerWidth > 1024 && typeof IntersectionObserver !== 'undefined') {
      const revealElements = container.querySelectorAll('.reveal');
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('active');
          }
        });
      }, { threshold: 0.1 });
      revealElements.forEach(el => observer.observe(el));
    } else {
      container.querySelectorAll('.reveal').forEach(el => el.classList.add('active'));
    }

    // Toggle agenda expand/collapse
    container.querySelectorAll('.event-details-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const detailsDiv = document.getElementById(`details-${id}`);
        const arrow = btn.querySelector('.arrow');
        
        if (detailsDiv.style.display === 'block') {
          detailsDiv.style.display = 'none';
          arrow.textContent = '▼';
        } else {
          detailsDiv.style.display = 'block';
          arrow.textContent = '▲';
        }
      });
    });

    // Wire up RSVP button click
    container.querySelectorAll('.rsvp-trigger-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const title = btn.getAttribute('data-title');
        openRSVPModal(id, title);
      });
    });
  }

  function openRSVPModal(id, title) {
    document.getElementById('rsvp-event-id').value = id;
    document.getElementById('rsvp-event-name').value = title;
    document.getElementById('modal-event-title').textContent = `RSVP: ${title}`;
    rsvpModal.classList.add('active');
  }

  function closeRSVPModal() {
    rsvpModal.classList.remove('active');
    rsvpNotification.style.display = 'none';
    rsvpForm.reset();
  }

  function showModalMessage(message, type) {
    rsvpNotification.textContent = message;
    rsvpNotification.className = 'form-notification';
    rsvpNotification.classList.add(type);
    rsvpNotification.style.display = 'block';
  }
});
