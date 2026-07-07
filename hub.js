import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, collection, getDocs, addDoc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- AUTHENTICATION CHECK --- //
const loader = document.getElementById('auth-loader');
const userEmailDisplay = document.getElementById('user-email-display');

let currentUserUid = null;
let currentUserName = "Anonymous";
let userTier = 'general';
let isAdmin = false;

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUserUid = user.uid;
    userEmailDisplay.innerText = user.email || user.phoneNumber || 'Authenticated User';
    
    // Check/create user document
    try {
      const userRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(userRef);
      if (!docSnap.exists()) {
        const isDefaultAdmin = (user.email === 'admin@ses.com');
        await setDoc(userRef, {
          email: user.email,
          membershipTier: 'general',
          isAdmin: isDefaultAdmin
        });
        userTier = 'general';
        isAdmin = isDefaultAdmin;
      } else {
        const data = docSnap.data();
        userTier = data.membershipTier || 'general';
        currentUserName = data.name || "Anonymous";
        
        // Auto-grant admin for testing
        if (user.email === 'admin@ses.com' && !data.isAdmin) {
          await setDoc(userRef, { isAdmin: true }, { merge: true });
          isAdmin = true;
        } else {
          isAdmin = !!data.isAdmin;
        }
      }
    } catch (e) {
      console.error("Error setting up user doc:", e);
    }

    // Unhide specialized tabs
    if (userTier === 'guild' || userTier === 'council') {
      const writeTab = document.getElementById('nav-write-article');
      if(writeTab) writeTab.style.display = 'block';
    }
    if (isAdmin) {
      const adminTab = document.getElementById('nav-admin-panel');
      if(adminTab) adminTab.style.display = 'block';
    }

    loader.style.display = 'none';
    
    // Load the user's own profile data
    loadUserProfile(user.uid);
    // Load the member directory
    loadMembers();
    
    // Load approved articles
    if(typeof loadApprovedArticles === 'function') loadApprovedArticles();
    
    // Preload admin stuff if admin
    if (isAdmin) {
      if(typeof loadAdminUsers === 'function') loadAdminUsers();
      if(typeof loadAdminArticles === 'function') loadAdminArticles();
    }
    
    // Enforce connect restriction if tier is general
    if (userTier === 'general') {
      const content = document.getElementById('connect-content');
      const restrict = document.getElementById('connect-restricted');
      if(content) content.style.display = 'none';
      if(restrict) restrict.style.display = 'block';
    }

  } else {
    window.location.replace('login.html');
  }
});

// --- LOGOUT LOGIC --- //
document.getElementById('btn-logout').addEventListener('click', () => {
  signOut(auth).then(() => {
    // Sign-out successful, the onAuthStateChanged will handle the redirect.
  }).catch((error) => {
    console.error("Logout error", error);
  });
});

// --- NAVIGATION LOGIC --- //
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.hub-section');
const sectionTitle = document.getElementById('section-title');

const titles = {
  'connect': 'CONNECT: Member Directory',
  'learn': 'LEARN: Education Center',
  'tools': 'VAULT: Playbooks & Tools',
  'opportunities': 'OPPORTUNITIES: The Marketplace',
  'intelligence': 'INTELLIGENCE: Weekly Insights',
  'profile': 'MY PROFILE: Settings'
};

navItems.forEach(item => {
  item.addEventListener('click', () => {
    // Remove active class from all nav items
    navItems.forEach(nav => nav.classList.remove('active'));
    // Add active class to clicked item
    item.classList.add('active');

    // Get the target section ID
    const targetId = item.getAttribute('data-target');

    // Hide all sections
    sections.forEach(sec => sec.classList.remove('active'));
    // Show the target section
    document.getElementById(targetId).classList.add('active');

    // Update the header title
    sectionTitle.innerText = titles[targetId];
  });
});

// --- PROFILE LOGIC --- //
const profileForm = document.getElementById('profile-form');
const profileStatus = document.getElementById('profile-status');

async function loadUserProfile(uid) {
  if (userTier === 'general') {
    const resMsg = document.getElementById('profile-restricted');
    if(resMsg) resMsg.style.display = 'block';
    const formElements = profileForm.elements;
    for (let i = 0; i < formElements.length; i++) {
      if(formElements[i].type !== 'submit') formElements[i].disabled = true;
    }
    const subBtn = profileForm.querySelector('button[type="submit"]');
    if(subBtn) subBtn.disabled = true;
  }

  if (userTier === 'general' || userTier === 'sellebrity') {
    const cMsg = document.getElementById('contact-restricted-msg');
    if(cMsg) cMsg.style.display = 'block';
    const cFields = document.getElementById('contact-fields');
    if (cFields) {
      cFields.querySelectorAll('input').forEach(f => f.disabled = true);
    }
  }

  try {
    const docSnap = await getDoc(doc(db, "users", uid));
    if (docSnap.exists()) {
      const data = docSnap.data();
      document.getElementById('profile-name').value = data.name || '';
      document.getElementById('profile-industry').value = data.industry || '';
      document.getElementById('profile-company').value = data.company || '';
      document.getElementById('profile-location').value = data.location || '';
      document.getElementById('profile-lookingfor').value = data.lookingfor || '';
      document.getElementById('profile-bio').value = data.bio || '';
      
      const linkIn = document.getElementById('profile-linkedin');
      if(linkIn) linkIn.value = data.linkedin || '';
      const web = document.getElementById('profile-website');
      if(web) web.value = data.website || '';
      const em = document.getElementById('profile-contact-email');
      if(em) em.value = data.contactEmail || '';
      const ph = document.getElementById('profile-contact-phone');
      if(ph) ph.value = data.contactPhone || '';
    }
  } catch (error) {
    console.error("Error loading profile:", error);
  }
}

profileForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentUserUid || userTier === 'general') return;

  const profileData = {
    name: document.getElementById('profile-name').value,
    industry: document.getElementById('profile-industry').value,
    company: document.getElementById('profile-company').value,
    location: document.getElementById('profile-location').value,
    lookingfor: document.getElementById('profile-lookingfor').value,
    bio: document.getElementById('profile-bio').value,
    updatedAt: new Date()
  };

  if (userTier === 'guild' || userTier === 'council') {
    profileData.linkedin = document.getElementById('profile-linkedin').value;
    profileData.website = document.getElementById('profile-website').value;
    profileData.contactEmail = document.getElementById('profile-contact-email').value;
    profileData.contactPhone = document.getElementById('profile-contact-phone').value;
  }

  try {
    await setDoc(doc(db, "users", currentUserUid), profileData, { merge: true });
    profileStatus.style.display = 'inline';
    setTimeout(() => { profileStatus.style.display = 'none'; }, 3000);
    // Refresh directory so their own card updates
    loadMembers();
    if(typeof loadAdminUsers === 'function' && isAdmin) loadAdminUsers();
  } catch (error) {
    console.error("Error saving profile:", error);
    alert("Error saving profile. Check console.");
  }
});

// --- MEMBER DIRECTORY LOGIC --- //
const memberGrid = document.getElementById('member-grid');
const searchInput = document.getElementById('member-search');
let allMembers = [];

async function loadMembers() {
  try {
    const querySnapshot = await getDocs(collection(db, "users"));
    allMembers = [];
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if(data.name && data.membershipTier !== 'general') { 
        allMembers.push({ id: docSnap.id, ...data });
      }
    });
    renderMembers(allMembers);
    if(typeof renderSpotlight === 'function') renderSpotlight(allMembers);
  } catch (error) {
    console.error("Error loading members:", error);
    memberGrid.innerHTML = '<p style="color:red;">Error loading members.</p>';
  }
}

function renderMembers(members) {
  if (members.length === 0) {
    memberGrid.innerHTML = '<p style="color:#888; grid-column: 1 / -1;">No members found.</p>';
    return;
  }

  memberGrid.innerHTML = members.map(m => {
    let badge = '';
    let contactsHTML = '';
    
    if (m.membershipTier === 'council') {
      badge = '<span style="background: rgba(200, 86, 23, 0.2); color: #c85617; border: 1px solid #c85617; padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: bold; letter-spacing: 1px;">COUNCIL MEMBER</span>';
    } else if (m.membershipTier === 'guild') {
      badge = '<span style="background: rgba(191, 161, 95, 0.2); color: #c8a97e; border: 1px solid #c8a97e; padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: bold; letter-spacing: 1px;">SELLEBRITY GUILD</span>';
    } else {
      badge = '<span style="background: rgba(15, 28, 63, 0.4); color: #60a5fa; border: 1px solid #3b82f6; padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: bold; letter-spacing: 1px;">SELLEBRITY</span>';
    }

    if (m.csepCompleted) {
      badge += ' <span style="background: rgba(34, 197, 94, 0.2); color: #22c55e; border: 1px solid #22c55e; padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: bold; letter-spacing: 1px; margin-left: 5px;">CSEP CERTIFIED</span>';
    }

    if (m.membershipTier === 'guild' || m.membershipTier === 'council') {
      const links = [];
      if (m.linkedin) links.push(`<a href="${escapeHTML(m.linkedin)}" target="_blank" style="color:#60a5fa; text-decoration:none;">LinkedIn</a>`);
      if (m.website) links.push(`<a href="${escapeHTML(m.website)}" target="_blank" style="color:#60a5fa; text-decoration:none;">Website</a>`);
      if (m.contactEmail) links.push(`<a href="mailto:${escapeHTML(m.contactEmail)}" style="color:#60a5fa; text-decoration:none;">Email</a>`);
      if (m.contactPhone) links.push(`<a href="tel:${escapeHTML(m.contactPhone)}" style="color:#60a5fa; text-decoration:none;">Phone</a>`);
      
      if (links.length > 0) {
        contactsHTML = `<div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid #333; font-size: 0.8rem; display: flex; gap: 10px; flex-wrap: wrap;">${links.join(' | ')}</div>`;
      }
    }

    return `
      <div class="member-card" style="background:#111; border:1px solid #333; border-radius:8px; padding:20px; transition: transform 0.2s; position: relative;">
        <div style="margin-bottom: 10px;">${badge}</div>
        <h3 style="color:#c8a97e; margin:0 0 5px 0;">${escapeHTML(m.name)}</h3>
        <p style="color:#fff; font-weight:500; margin:0 0 5px 0; font-size:0.9rem;">${escapeHTML(m.company || '')} ${m.location ? '• ' + escapeHTML(m.location) : ''}</p>
        <p style="color:#aaa; font-size:0.8rem; margin:0 0 10px 0; text-transform:uppercase; letter-spacing:1px;">${escapeHTML(m.industry || '')}</p>
        ${m.lookingfor ? `<p style="color:#c8a97e; font-size:0.85rem; margin:0 0 10px 0;"><strong>Looking for:</strong> ${escapeHTML(m.lookingfor)}</p>` : ''}
        <p style="color:#888; font-size:0.9rem; margin:0; line-height:1.4;">${escapeHTML(m.bio || 'No bio provided.')}</p>
        ${contactsHTML}
      </div>
    `;
  }).join('');
}

function renderSpotlight(members) {
  const spotlightContainer = document.getElementById('spotlight-banner');
  const spotlightGrid = document.getElementById('spotlight-members');
  if(!spotlightContainer || !spotlightGrid) return;
  
  const featured = members.filter(m => m.membershipTier === 'guild' || m.membershipTier === 'council');
  if (featured.length > 0) {
    spotlightContainer.style.display = 'block';
    // Randomize
    const displayFeatured = featured.sort(() => 0.5 - Math.random()).slice(0, 3);
    
    spotlightGrid.innerHTML = displayFeatured.map(m => `
      <div style="background: rgba(0,0,0,0.5); border: 1px solid #333; padding: 15px; border-radius: 6px; min-width: 250px; flex: 1;">
        <h4 style="color: #fff; margin: 0 0 5px 0;">${escapeHTML(m.name)}</h4>
        <p style="color: #aaa; margin: 0; font-size: 0.85rem;">${escapeHTML(m.company || '')}</p>
      </div>
    `).join('');
  } else {
    spotlightContainer.style.display = 'none';
  }
}

searchInput.addEventListener('input', (e) => {
  const term = e.target.value.toLowerCase();
  const filtered = allMembers.filter(m => {
    return (m.name && m.name.toLowerCase().includes(term)) ||
           (m.industry && m.industry.toLowerCase().includes(term)) ||
           (m.company && m.company.toLowerCase().includes(term)) ||
           (m.location && m.location.toLowerCase().includes(term)) ||
           (m.lookingfor && m.lookingfor.toLowerCase().includes(term)) ||
           (m.bio && m.bio.toLowerCase().includes(term));
  });
  renderMembers(filtered);
});

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
}

// --- SHARE UPDATE LOGIC --- //
const btnShareUpdate = document.getElementById('btn-share-update');
const updateModal = document.getElementById('update-modal');
const btnCloseUpdate = document.getElementById('btn-close-update');
const btnSubmitUpdate = document.getElementById('btn-submit-update');

if(btnShareUpdate && updateModal) {
  btnShareUpdate.addEventListener('click', () => {
    updateModal.style.display = 'flex';
  });
  
  btnCloseUpdate.addEventListener('click', () => {
    updateModal.style.display = 'none';
  });
  
  btnSubmitUpdate.addEventListener('click', async () => {
    const type = document.getElementById('update-type').value;
    const text = document.getElementById('update-text').value;
    
    if (!text.trim()) { 
      alert("Please enter your update text."); 
      return; 
    }
    
    if (!currentUserUid) {
      alert("You must be logged in to share an update.");
      return;
    }

    try {
      // Save to Firestore updates collection
      await addDoc(collection(db, "updates"), {
        uid: currentUserUid,
        type: type,
        text: text,
        timestamp: new Date()
      });
      
      // Dynamically add it to the top of the UI list
      const ul = document.getElementById('updates-list');
      const li = document.createElement('li');
      li.style.marginBottom = '10px';
      li.style.cursor = 'pointer';
      li.innerHTML = `<span style="color:#c8a97e; font-size: 0.75rem;">${type}</span><br>${escapeHTML(text)}`;
      ul.prepend(li); // add to top
      
      // Clear form and close modal
      document.getElementById('update-text').value = '';
      updateModal.style.display = 'none';
      
    } catch (e) {
      console.error(e);
      alert("Error posting update. Please try again.");
    }
  });
}

// --- PRIVATE GROUPS LOGIC --- //
const groupTags = document.querySelectorAll('.private-group-tag');
const groupModal = document.getElementById('group-modal');
const groupModalText = document.getElementById('group-modal-text');
const btnCloseGroup = document.getElementById('btn-close-group');
const btnSubmitGroup = document.getElementById('btn-submit-group');
let selectedGroup = '';

if (groupTags.length > 0 && groupModal) {
  groupTags.forEach(tag => {
    tag.addEventListener('click', () => {
      selectedGroup = tag.innerText;
      if (!currentUserUid) {
        alert("You must be logged in to request access to a private group.");
        return;
      }
      groupModalText.innerText = `Would you like to send a request to join the "${selectedGroup}" private group?`;
      groupModal.style.display = 'flex';
    });
  });

  btnCloseGroup.addEventListener('click', () => {
    groupModal.style.display = 'none';
  });

  btnSubmitGroup.addEventListener('click', () => {
    groupModal.style.display = 'none';
    alert(`Your request to join "${selectedGroup}" has been sent to the Admins for review.`);
  });
}

// --- WRITE ARTICLE LOGIC --- //
const articleForm = document.getElementById('article-form');
if (articleForm) {
  articleForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUserUid) return;
    
    const title = document.getElementById('article-title').value;
    const category = document.getElementById('article-category').value;
    const content = document.getElementById('article-content').value;
    
    try {
      await addDoc(collection(db, "articles"), {
        uid: currentUserUid,
        authorName: document.getElementById('profile-name').value || currentUserName || 'Member',
        title,
        category,
        content,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      
      const statusSpan = document.getElementById('article-status');
      statusSpan.style.display = 'inline';
      articleForm.reset();
      setTimeout(() => { statusSpan.style.display = 'none'; }, 4000);
      
    } catch (err) {
      console.error("Error submitting article", err);
      alert("Error submitting article.");
    }
  });
}

// --- ADMIN PANEL LOGIC --- //
const tabUsers = document.getElementById('tab-manage-users');
const tabArticles = document.getElementById('tab-approve-articles');
const secUsers = document.getElementById('admin-users-section');
const secArticles = document.getElementById('admin-articles-section');

if (tabUsers && tabArticles) {
  tabUsers.addEventListener('click', () => {
    tabUsers.style.borderBottom = '2px solid #ef4444';
    tabUsers.style.color = '#fff';
    tabArticles.style.borderBottom = 'none';
    tabArticles.style.color = '#888';
    secUsers.style.display = 'block';
    secArticles.style.display = 'none';
  });
  tabArticles.addEventListener('click', () => {
    tabArticles.style.borderBottom = '2px solid #ef4444';
    tabArticles.style.color = '#fff';
    tabUsers.style.borderBottom = 'none';
    tabUsers.style.color = '#888';
    secArticles.style.display = 'block';
    secUsers.style.display = 'none';
  });
}

async function loadAdminUsers() {
  const tbody = document.getElementById('admin-users-tbody');
  const countSpan = document.getElementById('admin-users-count');
  if(!tbody) return;
  
  try {
    const qSnap = await getDocs(collection(db, "users"));
    countSpan.innerText = `${qSnap.size} Users`;
    let html = '';
    
    qSnap.forEach(docSnap => {
      const u = docSnap.data();
      const uid = docSnap.id;
      const t = u.membershipTier || 'general';
      const isAdm = !!u.isAdmin;
      const isCsep = !!u.csepCompleted;
      
      html += `
        <tr style="border-bottom: 1px solid #222;">
          <td style="padding: 10px;">${escapeHTML(u.name || 'No Name')}</td>
          <td style="padding: 10px; color: #888;">${escapeHTML(u.email || 'No Email')}</td>
          <td style="padding: 10px;">
            <select class="admin-tier-select" data-uid="${uid}" style="background:#050505; color:#fff; border:1px solid #333; padding:5px; border-radius:4px;">
              <option value="general" ${t==='general'?'selected':''}>General</option>
              <option value="sellebrity" ${t==='sellebrity'?'selected':''}>Sellebrity</option>
              <option value="guild" ${t==='guild'?'selected':''}>Sellebrity Guild</option>
              <option value="council" ${t==='council'?'selected':''}>Sellebrity Council</option>
            </select>
          </td>
          <td style="padding: 10px;">
            <input type="checkbox" class="admin-isadmin-checkbox" data-uid="${uid}" ${isAdm?'checked':''}>
          </td>
          <td style="padding: 10px;">
            <input type="checkbox" class="admin-csep-checkbox" data-uid="${uid}" ${isCsep?'checked':''}>
          </td>
          <td style="padding: 10px;">
            <button class="admin-save-user-btn" data-uid="${uid}" style="background:#ef4444; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">Save</button>
          </td>
        </tr>
      `;
    });
    
    tbody.innerHTML = html;
    
    // Attach events
    document.querySelectorAll('.admin-save-user-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const uid = e.target.getAttribute('data-uid');
        const tr = e.target.closest('tr');
        const newTier = tr.querySelector('.admin-tier-select').value;
        const newIsAdmin = tr.querySelector('.admin-isadmin-checkbox').checked;
        const newCsep = tr.querySelector('.admin-csep-checkbox').checked;
        
        e.target.innerText = 'Saving...';
        try {
          await setDoc(doc(db, "users", uid), {
            membershipTier: newTier,
            isAdmin: newIsAdmin,
            csepCompleted: newCsep
          }, { merge: true });
          e.target.innerText = 'Saved!';
          setTimeout(() => { e.target.innerText = 'Save'; }, 2000);
          
          if(uid === currentUserUid) {
            userTier = newTier;
            isAdmin = newIsAdmin;
          }
          // Refresh member grid in case tier or csep changed
          loadMembers();
        } catch(err) {
          console.error(err);
          e.target.innerText = 'Error';
        }
      });
    });
    
  } catch (err) {
    console.error("Admin user load error", err);
    tbody.innerHTML = `<tr><td colspan="6" style="color:red; padding:10px;">Error loading users</td></tr>`;
  }
}

window.loadAdminUsers = loadAdminUsers; // Export for global usage if needed

async function loadAdminArticles() {
  const container = document.getElementById('admin-articles-list');
  if(!container) return;
  
  try {
    const qSnap = await getDocs(query(collection(db, "articles"), orderBy("createdAt", "desc")));
    let pendingArticles = [];
    qSnap.forEach(docSnap => {
      const a = docSnap.data();
      if(a.status === 'pending') {
        pendingArticles.push({ id: docSnap.id, ...a });
      }
    });
    
    if (pendingArticles.length === 0) {
      container.innerHTML = '<p style="color:#888;">No pending articles to review.</p>';
      return;
    }
    
    container.innerHTML = pendingArticles.map(a => `
      <div style="background: #111; border: 1px solid #333; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
        <span style="color:#c8a97e; font-size:0.8rem; text-transform:uppercase;">${escapeHTML(a.category)}</span>
        <h3 style="color:#fff; margin:5px 0;">${escapeHTML(a.title)}</h3>
        <p style="color:#aaa; font-size:0.9rem; margin-bottom:15px;">By ${escapeHTML(a.authorName || 'Unknown')}</p>
        <div style="background:#050505; padding:15px; border-radius:4px; font-size:0.9rem; color:#ccc; max-height:200px; overflow-y:auto; margin-bottom:15px; white-space: pre-wrap;">${escapeHTML(a.content)}</div>
        <div style="display:flex; gap:10px;">
          <button class="admin-approve-btn" data-id="${a.id}" style="background:#4ade80; color:black; font-weight:bold; border:none; padding:8px 15px; border-radius:4px; cursor:pointer;">Approve & Publish</button>
          <button class="admin-reject-btn" data-id="${a.id}" style="background:transparent; color:#ef4444; border:1px solid #ef4444; padding:8px 15px; border-radius:4px; cursor:pointer;">Reject</button>
        </div>
      </div>
    `).join('');
    
    document.querySelectorAll('.admin-approve-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.getAttribute('data-id');
        await setDoc(doc(db, "articles", id), { status: 'approved', approvedAt: serverTimestamp() }, { merge: true });
        loadAdminArticles();
        if(typeof loadApprovedArticles === 'function') loadApprovedArticles();
      });
    });
    
    document.querySelectorAll('.admin-reject-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.getAttribute('data-id');
        await setDoc(doc(db, "articles", id), { status: 'rejected' }, { merge: true });
        loadAdminArticles();
      });
    });
    
  } catch(err) {
    console.error("Admin articles load error", err);
    container.innerHTML = '<p style="color:red;">Error loading articles.</p>';
  }
}
window.loadAdminArticles = loadAdminArticles;

// --- PEER INSIGHTS (Intelligence Center) --- //
async function loadApprovedArticles() {
  const container = document.getElementById('approved-articles-list');
  if(!container) return;
  
  try {
    const qSnap = await getDocs(query(collection(db, "articles"), orderBy("createdAt", "desc")));
    let approved = [];
    qSnap.forEach(docSnap => {
      const a = docSnap.data();
      if(a.status === 'approved') {
        approved.push({ id: docSnap.id, ...a });
      }
    });
    
    if (approved.length === 0) {
      container.innerHTML = '<p style="color:#888;">No peer insights published yet.</p>';
      return;
    }
    
    container.innerHTML = approved.map(a => `
      <div style="background: #111; border: 1px solid #333; border-radius: 8px; padding: 25px; margin-bottom: 25px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:15px;">
          <div>
            <span style="color:#c8a97e; font-size:0.8rem; text-transform:uppercase; letter-spacing:1px;">${escapeHTML(a.category)}</span>
            <h4 style="color:#fff; font-size:1.3rem; margin:5px 0;">${escapeHTML(a.title)}</h4>
          </div>
          <span style="background:rgba(200, 169, 126, 0.1); color:#c8a97e; padding:4px 10px; border-radius:20px; font-size:0.75rem;">Verified Member</span>
        </div>
        <p style="color:#aaa; font-size:0.9rem; margin-bottom:20px;">By <strong>${escapeHTML(a.authorName || 'Member')}</strong></p>
        <div style="color:#ccc; line-height:1.6; font-size:0.95rem; white-space: pre-wrap;">${escapeHTML(a.content)}</div>
      </div>
    `).join('');
    
  } catch(err) {
    console.error("Error loading approved articles", err);
    container.innerHTML = '<p style="color:red;">Error loading peer insights.</p>';
  }
}
window.loadApprovedArticles = loadApprovedArticles;
