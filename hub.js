import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, addDoc, query, where, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { learningTracks } from './learnData.js';
import { weeklyIntelligence } from './intelData.js';

// --- AUTHENTICATION CHECK --- //
const loader = document.getElementById('auth-loader');
const userEmailDisplay = document.getElementById('user-email-display');

let currentUserUid = null;
let currentUserName = "Anonymous";
let userTier = 'general';
let isAdmin = false;

// Global article state lists
let userReadArticles = [];
let userFavoriteArticles = [];
let userReadLaterArticles = [];
let userBookmarkedIntel = [];

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUserUid = user.uid;
    userEmailDisplay.innerText = user.email || user.phoneNumber || 'Authenticated User';
    
    // Check/create user document
    try {
      const userRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(userRef);
      if (!docSnap.exists()) {
        const userEmail = (user.email || '').trim().toLowerCase();
        let tier = 'general';
        
        try {
          const approvedRef = doc(db, "approved_emails", userEmail);
          const approvedSnap = await getDoc(approvedRef);
          if (approvedSnap.exists()) {
            tier = approvedSnap.data().membershipTier || 'general';
            // Mark email as registered
            await setDoc(approvedRef, {
              registered: true,
              registeredAt: serverTimestamp()
            }, { merge: true });

            // Also update the application status to 'registered'
            try {
              const appsRef = collection(db, "applications");
              const appQ = query(appsRef, where("email", "==", userEmail));
              const appQSnap = await getDocs(appQ);
              appQSnap.forEach(async (appDoc) => {
                await setDoc(appDoc.ref, { status: 'registered' }, { merge: true });
              });
            } catch(appUpdateErr) {
              console.error("Error updating application status on signup:", appUpdateErr);
            }
          }
        } catch(approvedErr) {
          console.error("Error reading approved email tier:", approvedErr);
        }

        const isDefaultAdmin = (user.email === 'admin@ses.com');
        await setDoc(userRef, {
          email: user.email,
          membershipTier: tier,
          isAdmin: isDefaultAdmin
        });
        userTier = tier;
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
    // Load opportunities feed
    loadOpportunities();
    
    // Load approved articles
    if(typeof loadApprovedArticles === 'function') loadApprovedArticles();
    
    // Preload admin stuff if admin
    if (isAdmin) {
      if(typeof loadAdminUsers === 'function') loadAdminUsers();
      if(typeof loadAdminApplications === 'function') loadAdminApplications();
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
  'performance': 'PERFORMANCE: Benchmark Performance',
  'intelligence': 'INTELLIGENCE: Weekly Insights',
  'events': 'EVENTS: Society Happenings',
  'profile': 'MY PROFILE: Settings',
  'write-article': 'WRITE AUTHORITY ARTICLE',
  'admin-panel': 'ADMIN CONTROL CENTER'
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
    sectionTitle.innerText = titles[targetId] || '';

    // Load events if events section is clicked
    if (targetId === 'events') {
      if (typeof loadHubEvents === 'function') loadHubEvents();
    }
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

      // Load article progress list states
      userReadArticles = data.readArticles || [];
      userFavoriteArticles = data.favoriteArticles || [];
      userReadLaterArticles = data.readLaterArticles || [];
      userBookmarkedIntel = data.bookmarkedIntel || [];

      // Save to cache
      localStorage.setItem(`ses_${uid}_read`, JSON.stringify(userReadArticles));
      localStorage.setItem(`ses_${uid}_favorite`, JSON.stringify(userFavoriteArticles));
      localStorage.setItem(`ses_${uid}_later`, JSON.stringify(userReadLaterArticles));
      localStorage.setItem(`ses_${uid}_bookmarked_intel`, JSON.stringify(userBookmarkedIntel));
    }
    // Update folder count indicators and UI badges
    if (typeof updateFolderCounts === 'function') updateFolderCounts();
    if (typeof refreshActiveArticlesView === 'function') refreshActiveArticlesView();
    if (typeof updateIntelBookmarkCount === 'function') updateIntelBookmarkCount();
    if (typeof refreshActiveIntelView === 'function') refreshActiveIntelView();
  } catch (error) {
    console.error("Error loading profile, loading from cache:", error);
    userReadArticles = JSON.parse(localStorage.getItem(`ses_${uid}_read`)) || [];
    userFavoriteArticles = JSON.parse(localStorage.getItem(`ses_${uid}_favorite`)) || [];
    userReadLaterArticles = JSON.parse(localStorage.getItem(`ses_${uid}_later`)) || [];
    userBookmarkedIntel = JSON.parse(localStorage.getItem(`ses_${uid}_bookmarked_intel`)) || [];
    
    if (typeof updateFolderCounts === 'function') updateFolderCounts();
    if (typeof refreshActiveArticlesView === 'function') refreshActiveArticlesView();
    if (typeof updateIntelBookmarkCount === 'function') updateIntelBookmarkCount();
    if (typeof refreshActiveIntelView === 'function') refreshActiveIntelView();
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
const tabApps = document.getElementById('tab-pending-applications');
const tabArticles = document.getElementById('tab-approve-articles');
const tabEvents = document.getElementById('tab-manage-events');
const secUsers = document.getElementById('admin-users-section');
const secApps = document.getElementById('admin-applications-section');
const secArticles = document.getElementById('admin-articles-section');
const secEvents = document.getElementById('admin-events-section');

function selectAdminTab(selectedTab, selectedSection) {
  [tabUsers, tabApps, tabArticles, tabEvents].forEach(tab => {
    if (tab) {
      tab.style.borderBottom = 'none';
      tab.style.color = '#888';
    }
  });
  [secUsers, secApps, secArticles, secEvents].forEach(sec => {
    if (sec) sec.style.display = 'none';
  });

  if (selectedTab) {
    selectedTab.style.borderBottom = '2px solid #ef4444';
    selectedTab.style.color = '#fff';
  }
  if (selectedSection) {
    selectedSection.style.display = 'block';
  }
}

if (tabUsers) tabUsers.addEventListener('click', () => { selectAdminTab(tabUsers, secUsers); if(typeof loadAdminUsers === 'function') loadAdminUsers(); });
if (tabApps) tabApps.addEventListener('click', () => { selectAdminTab(tabApps, secApps); if(typeof loadAdminApplications === 'function') loadAdminApplications(); });
if (tabArticles) tabArticles.addEventListener('click', () => { selectAdminTab(tabArticles, secArticles); if(typeof loadAdminArticles === 'function') loadAdminArticles(); });
if (tabEvents) tabEvents.addEventListener('click', () => { selectAdminTab(tabEvents, secEvents); if(typeof loadAdminEvents === 'function') loadAdminEvents(); });

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
    // Add search functionality
    const searchInput = document.getElementById('admin-user-search');
    if (searchInput && !searchInput.dataset.listenerAttached) {
      searchInput.dataset.listenerAttached = 'true';
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const rows = tbody.querySelectorAll('tr');
        rows.forEach(row => {
          const nameCell = row.cells[0]?.textContent.toLowerCase() || '';
          const emailCell = row.cells[1]?.textContent.toLowerCase() || '';
          if (nameCell.includes(query) || emailCell.includes(query)) {
            row.style.display = '';
          } else {
            row.style.display = 'none';
          }
        });
      });
    }
  } catch (err) {
    console.error("Admin user load error", err);
    tbody.innerHTML = `<tr><td colspan="6" style="color:red; padding:10px;">Error loading users</td></tr>`;
  }
}

window.loadAdminUsers = loadAdminUsers; // Export for global usage if needed

async function loadAdminApplications() {
  const tbodyPending = document.getElementById('admin-applications-tbody');
  const tbodyApproved = document.getElementById('admin-approved-applications-tbody');
  const badge = document.getElementById('admin-apps-badge');
  const pendingCountSpan = document.getElementById('admin-pending-apps-count');
  const approvedCountSpan = document.getElementById('admin-approved-apps-count');

  if(!tbodyPending || !tbodyApproved) return;

  try {
    const qSnap = await getDocs(collection(db, "applications"));
    let pendingCount = 0;
    let approvedCount = 0;
    let pendingHtml = '';
    let approvedHtml = '';

    qSnap.forEach(docSnap => {
      const app = docSnap.data();
      const appId = docSnap.id;

      const name = escapeHTML(app.fullName || 'No Name');
      const email = escapeHTML(app.email || 'No Email');
      const phone = app.phone ? `<br>${escapeHTML(app.phone)}` : '';
      
      let companyTitleHtml = '';
      if (app.applicationType === 'csep') {
        companyTitleHtml = `<span style="font-size:0.9rem; color:#60a5fa; font-weight:500;">CSEP Candidate</span>`;
      } else {
        const company = escapeHTML(app.company || '');
        const title = escapeHTML(app.title || '');
        companyTitleHtml = `${company}<br><span style="font-size:0.85rem; color:#aaa;">${title}</span>`;
      }

      let tierHtml = '';
      if (app.applicationType === 'csep') {
        tierHtml = `<span style="color:#60a5fa; font-weight:bold;">CSEP (Sellebrity)</span>`;
      } else {
        const tier = escapeHTML(app.tier || 'general');
        tierHtml = `<span style="color:#c8a97e; font-weight:bold;">${tier.charAt(0).toUpperCase() + tier.slice(1)}</span>`;
      }

      const tier = escapeHTML(app.tier || 'sellebrity');
      const exp = escapeHTML(app.experience || 'No experience provided');

      if (app.status === 'pending') {
        pendingCount++;
        pendingHtml += `
          <tr style="border-bottom: 1px solid #222;" data-app-id="${appId}">
            <td style="padding: 15px;"><strong>${name}</strong></td>
            <td style="padding: 15px; color: #888;">${email}${phone}</td>
            <td style="padding: 15px;">${companyTitleHtml}</td>
            <td style="padding: 15px;">${tierHtml}</td>
            <td style="padding: 15px; font-size:0.85rem; max-width: 250px; white-space: normal; word-break: break-word;">${exp}</td>
            <td style="padding: 15px; display: flex; gap: 10px; align-items: center; min-height: 80px;">
              <button class="admin-app-approve-btn" data-id="${appId}" data-email="${email.toLowerCase()}" data-name="${name}" data-tier="${tier}" style="background:#4ade80; color:black; border:none; padding:8px 12px; border-radius:4px; font-weight:bold; cursor:pointer;">Approve</button>
              <button class="admin-app-decline-btn" data-id="${appId}" style="background:#ef4444; color:white; border:none; padding:8px 12px; border-radius:4px; cursor:pointer;">Decline</button>
            </td>
          </tr>
        `;
      } else if (app.status === 'approved') {
        approvedCount++;
        approvedHtml += `
          <tr style="border-bottom: 1px solid #222;" data-app-id="${appId}">
            <td style="padding: 15px;"><strong>${name}</strong></td>
            <td style="padding: 15px; color: #888;">${email}${phone}</td>
            <td style="padding: 15px;">${companyTitleHtml}</td>
            <td style="padding: 15px;">${tierHtml}</td>
            <td style="padding: 15px; font-size:0.85rem; max-width: 250px; white-space: normal; word-break: break-word;">${exp}</td>
            <td style="padding: 15px; display: flex; gap: 10px; align-items: center; min-height: 80px;">
              <button class="admin-app-send-invite-btn" data-email="${email.toLowerCase()}" data-name="${name}" data-tier="${tier}" style="background:#3b82f6; color:white; border:none; padding:8px 12px; border-radius:4px; font-weight:bold; cursor:pointer; display:inline-flex; align-items:center; gap:5px;" title="Copy template & send invite email">✉ Send Invite</button>
              <button class="admin-app-decline-btn" data-id="${appId}" style="background:#ef4444; color:white; border:none; padding:8px 12px; border-radius:4px; cursor:pointer;">Revoke</button>
            </td>
          </tr>
        `;
      }
    });

    // 1. Render Pending List
    if (pendingCount === 0) {
      tbodyPending.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#888;">No pending applications.</td></tr>`;
      if (pendingCountSpan) pendingCountSpan.style.display = 'none';
      if (badge) badge.style.display = 'none';
    } else {
      tbodyPending.innerHTML = pendingHtml;
      if (pendingCountSpan) {
        pendingCountSpan.innerText = pendingCount;
        pendingCountSpan.style.display = 'inline-block';
      }
      if (badge) {
        badge.innerText = pendingCount;
        badge.style.display = 'inline-block';
      }
    }

    // 2. Render Approved (Awaiting Signup) List
    if (approvedCount === 0) {
      tbodyApproved.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#888;">No approved applications awaiting registration.</td></tr>`;
      if (approvedCountSpan) approvedCountSpan.style.display = 'none';
    } else {
      tbodyApproved.innerHTML = approvedHtml;
      if (approvedCountSpan) {
        approvedCountSpan.innerText = approvedCount;
        approvedCountSpan.style.display = 'inline-block';
      }
    }

    // Attach Event Handlers to both tables
    
    // Approval Handler (just moves applicant to approved state without automatic email popup)
    document.querySelectorAll('.admin-app-approve-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const appId = e.target.getAttribute('data-id');
        const appEmail = e.target.getAttribute('data-email');
        const appTier = e.target.getAttribute('data-tier');

        e.target.innerText = 'Approving...';
        e.target.disabled = true;

        try {
          // 1. Update application status in Firestore to 'approved'
          await setDoc(doc(db, "applications", appId), { status: 'approved' }, { merge: true });

          // 2. Add email to approved_emails registry (permanently store record of approval)
          await setDoc(doc(db, "approved_emails", appEmail), {
            email: appEmail,
            membershipTier: appTier,
            approvedAt: serverTimestamp(),
            registered: false
          });

          // Refresh list to move the applicant down
          loadAdminApplications();
        } catch(err) {
          console.error("Failed to approve application:", err);
          e.target.innerText = 'Error';
          e.target.disabled = false;
        }
      });
    });

    // Email Invite Sender (Copies template and opens mail client on button click)
    document.querySelectorAll('.admin-app-send-invite-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetBtn = e.currentTarget;
        const appEmail = targetBtn.getAttribute('data-email');
        const appName = targetBtn.getAttribute('data-name');
        const appTier = targetBtn.getAttribute('data-tier');

        const originalText = targetBtn.innerHTML;
        targetBtn.innerText = 'Copying...';

        const emailBody = `Hello ${appName},\n\nCongratulations! We are thrilled to inform you that your application for the ${appTier.charAt(0).toUpperCase() + appTier.slice(1)} Membership at the Sports & Entertainment Society has been reviewed and approved.\n\nYou can now register your account and access the Society Hub here:\n${window.location.origin}/login.html?register=true&email=${encodeURIComponent(appEmail)}\n\nWe look forward to connecting with you in the Society.\n\nBest regards,\nThe Sports & Entertainment Society Team`;

        navigator.clipboard.writeText(emailBody)
          .then(() => {
            alert(`Approval email template copied to clipboard! Opening your email client to notify ${appName}...`);
            targetBtn.innerHTML = '✉ Invite Sent!';
            setTimeout(() => { targetBtn.innerHTML = originalText; }, 2000);
          })
          .catch(err => {
            console.error('Clipboard write failed', err);
            targetBtn.innerHTML = originalText;
          });
          
        window.open(`mailto:${appEmail}?subject=Your Sports %26 Entertainment Society Application is Approved!&body=${encodeURIComponent(emailBody)}`);
      });
    });

    // Decline / Revoke Handler
    document.querySelectorAll('.admin-app-decline-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if (!confirm("Are you sure you want to decline / revoke this application?")) return;

        const appId = e.target.getAttribute('data-id');
        e.target.innerText = 'Removing...';
        e.target.disabled = true;

        try {
          // Delete the application doc from applications collection
          await deleteDoc(doc(db, "applications", appId));
          loadAdminApplications();
        } catch(err) {
          console.error("Failed to decline application:", err);
          e.target.innerText = 'Error';
          e.target.disabled = false;
        }
      });
    });

  } catch (err) {
    console.error("Admin applications load error", err);
    tbodyPending.innerHTML = `<tr><td colspan="6" style="color:red; padding:10px;">Error loading applications</td></tr>`;
  }
}

window.loadAdminApplications = loadAdminApplications;

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

// --- EDUCATION CENTER (LEARNING TRACKS & ARTICLES) LOGIC --- //
let activeTrackKey = null;
let activeFolderKey = null;
let currentOpenArticleId = null;

function getAllArticles() {
  const list = [];
  Object.keys(learningTracks).forEach(trackKey => {
    const track = learningTracks[trackKey];
    track.articles.forEach(art => {
      list.push({
        ...art,
        trackTitle: track.title,
        trackKey: trackKey
      });
    });
  });
  return list;
}

function updateFolderCounts() {
  const favBadge = document.getElementById('count-favorites');
  const laterBadge = document.getElementById('count-read-later');
  const readBadge = document.getElementById('count-read');
  
  if (favBadge) favBadge.innerText = userFavoriteArticles.length;
  if (laterBadge) laterBadge.innerText = userReadLaterArticles.length;
  if (readBadge) readBadge.innerText = userReadArticles.length;
}
window.updateFolderCounts = updateFolderCounts;

async function toggleArticleState(articleId, stateType) {
  if (!currentUserUid) return;
  
  let targetArray;
  if (stateType === 'read') {
    targetArray = userReadArticles;
  } else if (stateType === 'favorite') {
    targetArray = userFavoriteArticles;
  } else if (stateType === 'later') {
    targetArray = userReadLaterArticles;
  }
  
  if (!targetArray) return;
  
  const index = targetArray.indexOf(articleId);
  if (index > -1) {
    targetArray.splice(index, 1);
  } else {
    targetArray.push(articleId);
  }
  
  // Update counts and UI immediately
  updateFolderCounts();
  refreshActiveArticlesView();
  updateModalActionButtons(articleId);
  
  // Cache to local storage
  localStorage.setItem(`ses_${currentUserUid}_read`, JSON.stringify(userReadArticles));
  localStorage.setItem(`ses_${currentUserUid}_favorite`, JSON.stringify(userFavoriteArticles));
  localStorage.setItem(`ses_${currentUserUid}_later`, JSON.stringify(userReadLaterArticles));
  
  // Sync to Firestore
  try {
    const userRef = doc(db, "users", currentUserUid);
    await setDoc(userRef, {
      readArticles: userReadArticles,
      favoriteArticles: userFavoriteArticles,
      readLaterArticles: userReadLaterArticles
    }, { merge: true });
  } catch (err) {
    console.error("Firestore progress sync failed, relying on cache:", err);
  }
}
window.toggleArticleState = toggleArticleState;

function updateModalActionButtons(articleId) {
  if (currentOpenArticleId !== articleId) return;
  
  const btnFav = document.getElementById('btn-toggle-favorite');
  const btnLater = document.getElementById('btn-toggle-read-later');
  const btnRead = document.getElementById('btn-toggle-read');
  
  if (!btnFav || !btnLater || !btnRead) return;
  
  const isFav = userFavoriteArticles.includes(articleId);
  const isLater = userReadLaterArticles.includes(articleId);
  const isRead = userReadArticles.includes(articleId);
  
  if (isFav) {
    btnFav.classList.add('active');
    btnFav.querySelector('.label').innerText = 'Favorited';
  } else {
    btnFav.classList.remove('active');
    btnFav.querySelector('.label').innerText = 'Add to Favorites';
  }
  
  if (isLater) {
    btnLater.classList.add('active');
    btnLater.querySelector('.label').innerText = 'Saved in Read Later';
  } else {
    btnLater.classList.remove('active');
    btnLater.querySelector('.label').innerText = 'Read Later';
  }
  
  if (isRead) {
    btnRead.classList.add('active');
    btnRead.querySelector('.label').innerText = 'Completed';
  } else {
    btnRead.classList.remove('active');
    btnRead.querySelector('.label').innerText = 'Mark as Completed';
  }
}

function refreshActiveArticlesView() {
  if (activeTrackKey) {
    const trackData = learningTracks[activeTrackKey];
    if (trackData) {
      const trackCards = document.querySelectorAll('.track-card');
      let activeCard = null;
      trackCards.forEach(c => {
        if (c.getAttribute('data-track') === activeTrackKey) activeCard = c;
      });
      selectTrack(activeTrackKey, activeCard);
    }
  } else if (activeFolderKey) {
    selectFolder(activeFolderKey);
  } else {
    clearSelection();
  }
}
window.refreshActiveArticlesView = refreshActiveArticlesView;

let trackCardsGlobal = [];
let libraryFoldersGlobal = [];
let learnDefaultContentGlobal = null;
let learnTrackContentGlobal = null;
let learnTrackTitleGlobal = null;
let trackArticlesGridGlobal = null;

function selectTrack(trackKey, cardEl) {
  activeTrackKey = trackKey;
  activeFolderKey = null; // reset folders

  // Clear search input
  const searchInput = document.getElementById('learn-search');
  if (searchInput) searchInput.value = '';
  const btnClear = document.getElementById('btn-clear-learn-search');
  if (btnClear) btnClear.style.display = 'none';
  
  const trackData = learningTracks[trackKey];
  if (!trackData) return;

  // Reset active styles on all cards and folders
  trackCardsGlobal.forEach(c => {
    c.style.background = '#111';
    c.style.borderColor = '#333';
    c.style.boxShadow = 'none';
  });
  libraryFoldersGlobal.forEach(f => f.classList.remove('active'));

  // Highlight active card
  if (cardEl) {
    cardEl.style.background = 'rgba(200, 169, 126, 0.1)';
    cardEl.style.borderColor = '#c8a97e';
    cardEl.style.boxShadow = '0 0 15px rgba(200, 169, 126, 0.2)';
  }

  // Update Title
  learnTrackTitleGlobal.innerText = `${trackData.title} Lessons`;

  // Render list
  renderArticlesList(trackData.articles, trackData.title);

  // Swap sections
  learnDefaultContentGlobal.style.display = 'none';
  learnTrackContentGlobal.style.display = 'block';
}

function selectFolder(folderKey) {
  activeFolderKey = folderKey;
  activeTrackKey = null; // reset tracks

  // Clear search input
  const searchInput = document.getElementById('learn-search');
  if (searchInput) searchInput.value = '';
  const btnClear = document.getElementById('btn-clear-learn-search');
  if (btnClear) btnClear.style.display = 'none';

  // Reset active styles on all cards and folders
  trackCardsGlobal.forEach(c => {
    c.style.background = '#111';
    c.style.borderColor = '#333';
    c.style.boxShadow = 'none';
  });
  libraryFoldersGlobal.forEach(f => {
    if (f.getAttribute('data-folder') === folderKey) {
      f.classList.add('active');
    } else {
      f.classList.remove('active');
    }
  });

  let filteredArticles = [];
  let folderTitle = '';
  const allArts = getAllArticles();
  
  if (folderKey === 'favorites') {
    filteredArticles = allArts.filter(art => userFavoriteArticles.includes(art.id));
    folderTitle = 'My Favorites';
  } else if (folderKey === 'read-later') {
    filteredArticles = allArts.filter(art => userReadLaterArticles.includes(art.id));
    folderTitle = 'Read Later';
  } else if (folderKey === 'read') {
    filteredArticles = allArts.filter(art => userReadArticles.includes(art.id));
    folderTitle = 'Completed Lessons';
  }

  // Update Title
  learnTrackTitleGlobal.innerText = `${folderTitle} (${filteredArticles.length})`;

  // Render list
  renderArticlesList(filteredArticles, folderTitle, true);

  // Swap sections
  learnDefaultContentGlobal.style.display = 'none';
  learnTrackContentGlobal.style.display = 'block';
}

function clearSelection() {
  activeTrackKey = null;
  activeFolderKey = null;

  // Clear search input
  const searchInput = document.getElementById('learn-search');
  if (searchInput) searchInput.value = '';
  const btnClear = document.getElementById('btn-clear-learn-search');
  if (btnClear) btnClear.style.display = 'none';
  trackCardsGlobal.forEach(c => {
    c.style.background = '#111';
    c.style.borderColor = '#333';
    c.style.boxShadow = 'none';
  });
  libraryFoldersGlobal.forEach(f => f.classList.remove('active'));
  learnTrackContentGlobal.style.display = 'none';
  learnDefaultContentGlobal.style.display = 'block';
}

function renderArticlesList(articles, trackTitle, showCategoryLabel = false) {
  trackArticlesGridGlobal.innerHTML = '';
  
  if (articles.length === 0) {
    trackArticlesGridGlobal.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #666; background: #0a0a0a; border: 1px solid #222; border-radius: 8px;">
        <p style="margin: 0; font-size: 1rem;">No articles found in this list.</p>
      </div>
    `;
    return;
  }
  
  articles.forEach((art, index) => {
    const card = document.createElement('div');
    card.style.background = '#0a0a0a';
    card.style.border = '1px solid #222';
    card.style.borderRadius = '8px';
    card.style.padding = '20px';
    card.style.cursor = 'pointer';
    card.style.transition = 'all 0.3s ease';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.justifyContent = 'space-between';
    card.style.position = 'relative';

    const isRead = userReadArticles.includes(art.id);
    const isFav = userFavoriteArticles.includes(art.id);
    const isLater = userReadLaterArticles.includes(art.id);

    // Excerpt (first line of the content)
    const excerpt = art.content.split('\n')[0];
    
    // Status Badges HTML
    let badgesHTML = '';
    if (isRead) badgesHTML += `<span style="font-size:0.9rem;" title="Completed">✅</span>`;
    if (isFav) badgesHTML += `<span style="font-size:0.9rem;" title="Favorite">⭐</span>`;
    if (isLater) badgesHTML += `<span style="font-size:0.9rem;" title="Read Later">🔖</span>`;
    
    const badgesContainer = badgesHTML 
      ? `<div style="display:flex; gap:6px; background:rgba(0,0,0,0.6); padding:4px 8px; border-radius:12px; border:1px solid #333; position:absolute; top:12px; right:12px; align-items:center;">${badgesHTML}</div>` 
      : '';

    const catLabel = showCategoryLabel && art.trackTitle 
      ? `<span style="color:#888; font-size:0.75rem; text-transform:uppercase; display:block; margin-bottom:5px; font-weight:600; letter-spacing:0.5px;">${escapeHTML(art.trackTitle)}</span>` 
      : '';

    card.innerHTML = `
      <div>
        ${badgesContainer}
        ${catLabel}
        <h4 style="margin: 0 0 8px; color: #fff; font-size: 1.1rem; line-height: 1.3; max-width: 80%;">${escapeHTML(art.title)}</h4>
        <p style="margin: 0 0 15px; color: #888; font-size: 0.85rem; line-height: 1.4;">${escapeHTML(excerpt)}</p>
      </div>
      
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
        <span style="color: #c8a97e; font-size: 0.85rem; font-weight: 500; display: inline-flex; align-items: center; gap: 5px;">Read Lesson →</span>
        
        <!-- Quick action toggle panel -->
        <div class="card-quick-actions" style="display: flex; gap: 6px;" onclick="event.stopPropagation();">
          <button class="quick-action-btn" onclick="toggleArticleState('${art.id}', 'favorite')" style="background: transparent; border: 1px solid ${isFav ? '#c8a97e' : '#333'}; color: ${isFav ? '#c8a97e' : '#888'}; padding: 4px 6px; border-radius: 4px; cursor: pointer; font-size: 0.75rem; transition: all 0.2s;" title="Favorite">⭐</button>
          <button class="quick-action-btn" onclick="toggleArticleState('${art.id}', 'later')" style="background: transparent; border: 1px solid ${isLater ? '#c8a97e' : '#333'}; color: ${isLater ? '#c8a97e' : '#888'}; padding: 4px 6px; border-radius: 4px; cursor: pointer; font-size: 0.75rem; transition: all 0.2s;" title="Read Later">🔖</button>
          <button class="quick-action-btn" onclick="toggleArticleState('${art.id}', 'read')" style="background: transparent; border: 1px solid ${isRead ? '#c8a97e' : '#333'}; color: ${isRead ? '#c8a97e' : '#888'}; padding: 4px 6px; border-radius: 4px; cursor: pointer; font-size: 0.75rem; transition: all 0.2s;" title="Mark Completed">✅</button>
        </div>
      </div>
    `;

    // Hover styling
    card.addEventListener('mouseenter', () => {
      card.style.borderColor = '#c8a97e';
      card.style.transform = 'translateY(-2px)';
      card.style.boxShadow = '0 5px 15px rgba(200, 169, 126, 0.05)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.borderColor = '#222';
      card.style.transform = 'translateY(0)';
      card.style.boxShadow = 'none';
    });

    // Reader trigger
    card.addEventListener('click', () => {
      openArticleReader(art, art.trackTitle || trackTitle);
    });

    trackArticlesGridGlobal.appendChild(card);
  });
}

function openArticleReader(article, trackTitle) {
  currentOpenArticleId = article.id;
  const readerModal = document.getElementById('article-reader-modal');
  const readerCategory = document.getElementById('reader-category');
  const readerTitle = document.getElementById('reader-title');
  const readerContent = document.getElementById('reader-content');
  
  if (!readerModal || !readerCategory || !readerTitle || !readerContent) return;

  readerCategory.innerText = trackTitle;
  readerTitle.innerText = article.title;
  
  // Format body text: Markdown bold formatting
  let formattedContent = article.content
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Apply list item double-newlines spacing
  formattedContent = formattedContent.replace(/(?<!\n)\n(\d+\.)/g, '\n\n$1');
  
  readerContent.innerHTML = formattedContent;
  
  // Sync buttons status
  updateModalActionButtons(article.id);

  // Modal open transitions
  readerModal.style.display = 'flex';
  readerModal.offsetHeight;
  readerModal.style.opacity = '1';
  document.body.style.overflow = 'hidden';
}

function filterArticlesBySearch() {
  const searchInput = document.getElementById('learn-search');
  const btnClear = document.getElementById('btn-clear-learn-search');
  if (!searchInput) return;

  const query = searchInput.value.trim().toLowerCase();
  
  if (btnClear) {
    btnClear.style.display = query ? 'block' : 'none';
  }

  // Determine the pool based on activeTrackKey or activeFolderKey
  let pool = [];
  let sourceTitle = '';

  if (activeTrackKey) {
    const track = learningTracks[activeTrackKey];
    pool = track.articles.map(art => ({ ...art, trackTitle: track.title, trackKey: activeTrackKey }));
    sourceTitle = `${track.title} Lessons`;
  } else if (activeFolderKey) {
    const allArts = getAllArticles();
    if (activeFolderKey === 'favorites') {
      pool = allArts.filter(art => userFavoriteArticles.includes(art.id));
      sourceTitle = 'My Favorites';
    } else if (activeFolderKey === 'read-later') {
      pool = allArts.filter(art => userReadLaterArticles.includes(art.id));
      sourceTitle = 'Read Later';
    } else if (activeFolderKey === 'read') {
      pool = allArts.filter(art => userReadArticles.includes(art.id));
      sourceTitle = 'Completed Lessons';
    }
  } else {
    // Global search
    pool = getAllArticles();
    sourceTitle = 'All Lessons';
  }

  const learnDefaultContent = document.getElementById('learn-default-content');
  const learnTrackContent = document.getElementById('learn-track-content');
  const learnTrackTitle = document.getElementById('learn-track-title');

  if (query) {
    // Filter the pool
    const filtered = pool.filter(art => 
      art.title.toLowerCase().includes(query) || 
      art.content.toLowerCase().includes(query) ||
      (art.trackTitle && art.trackTitle.toLowerCase().includes(query))
    );

    if (learnDefaultContent && learnTrackContent && learnTrackTitle) {
      learnTrackTitle.innerText = `Search Results for "${searchInput.value}" (${filtered.length})`;
      renderArticlesList(filtered, 'Search Results', true);
      
      learnDefaultContent.style.display = 'none';
      learnTrackContent.style.display = 'block';
    }
  } else {
    // If query is cleared, restore the original selection layout
    if (activeTrackKey) {
      const track = learningTracks[activeTrackKey];
      if (learnDefaultContent && learnTrackContent && learnTrackTitle) {
        learnTrackTitle.innerText = `${track.title} Lessons`;
        renderArticlesList(track.articles, track.title);
        learnDefaultContent.style.display = 'none';
        learnTrackContent.style.display = 'block';
      }
    } else if (activeFolderKey) {
      let filteredArticles = [];
      let folderTitle = '';
      const allArts = getAllArticles();
      if (activeFolderKey === 'favorites') {
        filteredArticles = allArts.filter(art => userFavoriteArticles.includes(art.id));
        folderTitle = 'My Favorites';
      } else if (activeFolderKey === 'read-later') {
        filteredArticles = allArts.filter(art => userReadLaterArticles.includes(art.id));
        folderTitle = 'Read Later';
      } else if (activeFolderKey === 'read') {
        filteredArticles = allArts.filter(art => userReadArticles.includes(art.id));
        folderTitle = 'Completed Lessons';
      }
      if (learnDefaultContent && learnTrackContent && learnTrackTitle) {
        learnTrackTitle.innerText = `${folderTitle} (${filteredArticles.length})`;
        renderArticlesList(filteredArticles, folderTitle, true);
        learnDefaultContent.style.display = 'none';
        learnTrackContent.style.display = 'block';
      }
    } else {
      if (learnDefaultContent && learnTrackContent) {
        learnTrackContent.style.display = 'none';
        learnDefaultContent.style.display = 'block';
      }
    }
  }
}
window.filterArticlesBySearch = filterArticlesBySearch;

function initLearningTracks() {
  const trackCards = document.querySelectorAll('.track-card');
  const libraryFolders = document.querySelectorAll('.library-folder');
  const learnDefaultContent = document.getElementById('learn-default-content');
  const learnTrackContent = document.getElementById('learn-track-content');
  const learnTrackTitle = document.getElementById('learn-track-title');
  const trackArticlesGrid = document.getElementById('track-articles-grid');
  const btnClearTrack = document.getElementById('btn-clear-track');
  
  // Search elements
  const learnSearch = document.getElementById('learn-search');
  const btnClearSearch = document.getElementById('btn-clear-learn-search');
  
  // Modal elements
  const readerModal = document.getElementById('article-reader-modal');
  const btnCloseReader = document.getElementById('btn-close-reader');
  const btnCloseReaderBottom = document.getElementById('btn-close-reader-bottom');

  if (!trackCards.length || !learnDefaultContent || !learnTrackContent || !trackArticlesGrid) {
    console.error("Learning tracks UI elements not found.");
    return;
  }

  // Bind search listeners
  if (learnSearch) {
    learnSearch.addEventListener('input', filterArticlesBySearch);
  }
  if (btnClearSearch) {
    btnClearSearch.addEventListener('click', () => {
      learnSearch.value = '';
      filterArticlesBySearch();
    });
  }

  // Bind to globals
  trackCardsGlobal = Array.from(trackCards);
  libraryFoldersGlobal = Array.from(libraryFolders);
  learnDefaultContentGlobal = learnDefaultContent;
  learnTrackContentGlobal = learnTrackContent;
  learnTrackTitleGlobal = learnTrackTitle;
  trackArticlesGridGlobal = trackArticlesGrid;

  // Track Card clicks
  trackCards.forEach(card => {
    card.addEventListener('click', () => {
      const trackKey = card.getAttribute('data-track');
      if (activeTrackKey === trackKey) {
        clearSelection();
      } else {
        selectTrack(trackKey, card);
      }
    });
  });

  // Library Folder clicks
  libraryFolders.forEach(folder => {
    folder.addEventListener('click', () => {
      const folderKey = folder.getAttribute('data-folder');
      if (activeFolderKey === folderKey) {
        clearSelection();
      } else {
        selectFolder(folderKey);
      }
    });
  });

  // Reset filter clicks
  if (btnClearTrack) {
    btnClearTrack.addEventListener('click', clearSelection);
  }

  // Reader Modal close actions
  function closeArticleReader() {
    if (!readerModal) return;
    readerModal.style.opacity = '0';
    setTimeout(() => {
      readerModal.style.display = 'none';
      document.body.style.overflow = '';
      currentOpenArticleId = null;
    }, 300);
  }

  if (btnCloseReader) btnCloseReader.addEventListener('click', closeArticleReader);
  if (btnCloseReaderBottom) btnCloseReaderBottom.addEventListener('click', closeArticleReader);
  
  if (readerModal) {
    readerModal.addEventListener('click', (e) => {
      if (e.target === readerModal) {
        closeArticleReader();
      }
    });
  }

  // Setup modal button action listeners
  const btnFav = document.getElementById('btn-toggle-favorite');
  const btnLater = document.getElementById('btn-toggle-read-later');
  const btnRead = document.getElementById('btn-toggle-read');
  
  if (btnFav) {
    btnFav.addEventListener('click', () => {
      if (currentOpenArticleId) {
        toggleArticleState(currentOpenArticleId, 'favorite');
      }
    });
  }
  if (btnLater) {
    btnLater.addEventListener('click', () => {
      if (currentOpenArticleId) {
        toggleArticleState(currentOpenArticleId, 'later');
      }
    });
  }
  if (btnRead) {
    btnRead.addEventListener('click', () => {
      if (currentOpenArticleId) {
        toggleArticleState(currentOpenArticleId, 'read');
      }
    });
  }

  // Trigger counts load
  updateFolderCounts();
}


// --- DYNAMIC INTELLIGENCE CENTER LOGIC --- //
let activeIntelWeekKey = 'current';

function updateIntelBookmarkCount() {
  const badge = document.getElementById('intel-bookmark-count');
  if (badge) {
    badge.innerText = userBookmarkedIntel.length;
  }
}
window.updateIntelBookmarkCount = updateIntelBookmarkCount;

async function toggleIntelBookmark(intelId) {
  if (!currentUserUid) return;

  const index = userBookmarkedIntel.indexOf(intelId);
  if (index > -1) {
    userBookmarkedIntel.splice(index, 1);
  } else {
    userBookmarkedIntel.push(intelId);
  }

  // Update badge immediately
  updateIntelBookmarkCount();

  // Rerender current view
  refreshActiveIntelView();

  // Cache locally
  localStorage.setItem(`ses_${currentUserUid}_bookmarked_intel`, JSON.stringify(userBookmarkedIntel));

  // Sync to Firestore
  try {
    const userRef = doc(db, "users", currentUserUid);
    await setDoc(userRef, {
      bookmarkedIntel: userBookmarkedIntel
    }, { merge: true });
  } catch (err) {
    console.error("Firestore bookmark sync failed, utilizing cache:", err);
  }
}
window.toggleIntelBookmark = toggleIntelBookmark;

function refreshActiveIntelView() {
  renderIntelligenceBrief(activeIntelWeekKey);
}
window.refreshActiveIntelView = refreshActiveIntelView;

let sectorDisplayMap = {};

function renderSectorCards(catName, gridEl) {
  const displayKey = activeIntelWeekKey + '_' + catName;
  const itemIds = sectorDisplayMap[displayKey] || [];
  const items = weeklyIntelligence.filter(item => itemIds.includes(item.id));

  if (items.length === 0) {
    gridEl.innerHTML = `<p style="color: #666; font-size: 0.9rem; padding: 10px; text-align: center;">No items found.</p>`;
    return;
  }

  // Sort them so they match the order in display map
  items.sort((a, b) => itemIds.indexOf(a.id) - itemIds.indexOf(b.id));

  gridEl.innerHTML = items.map(item => {
    const isBookmarked = userBookmarkedIntel.includes(item.id);
    const pubDate = new Date();
    pubDate.setDate(pubDate.getDate() - item.daysAgo);
    const dateString = pubDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    return `
      <div class="intel-item-card" style="border-left: 3px solid #c8a97e; padding-left: 15px; display: flex; justify-content: space-between; align-items: flex-start; gap: 20px;">
        <div style="flex: 1;">
          <h4 style="margin: 0 0 5px 0; color: #fff; font-size: 1.05rem; line-height: 1.4;">${escapeHTML(item.title)}</h4>
          <span style="color: #666; font-size: 0.75rem; font-weight: 500; display: block; margin-bottom: 6px;">Published: ${dateString}</span>
          <p style="margin: 0 0 10px 0; color: #aaa; font-size: 0.9rem; line-height: 1.5;">${escapeHTML(item.description)}</p>
          <a href="${escapeHTML(item.url)}" target="_blank" style="color: #c8a97e; font-size: 0.85rem; font-weight: 600; display: inline-flex; align-items: center; gap: 5px;">Read Source Article ↗</a>
        </div>
        
        <button onclick="toggleIntelBookmark('${item.id}')" style="background: transparent; border: 1px solid ${isBookmarked ? '#c8a97e' : '#444'}; color: ${isBookmarked ? '#c8a97e' : '#888'}; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.8rem; transition: all 0.2s; white-space: nowrap;">
          ${isBookmarked ? '🔖 Saved' : '🔖 Save Intel'}
        </button>
      </div>
    `;
  }).join('<hr style="border: 0; border-top: 1px dashed #222; margin: 15px 0;">');
}
window.renderSectorCards = renderSectorCards;

function refreshSector(catName) {
  const gridId = `sector-grid-${catName.replace(/[^a-z0-9]/gi, '-').toLowerCase().replace(/-+/g, '-')}`;
  const gridEl = document.getElementById(gridId);
  if (!gridEl) return;

  // Show scraping simulator
  gridEl.style.opacity = '0.4';
  gridEl.innerHTML = `
    <div style="text-align: center; padding: 40px 10px; color: #c8a97e; font-size: 0.9rem; font-weight: bold; letter-spacing: 0.5px; display: flex; align-items: center; justify-content: center; gap: 10px;">
      <span class="refresh-spinner" style="display: inline-block; width: 16px; height: 16px; border: 2px solid #c8a97e; border-radius: 50%; border-top-color: transparent; animation: spin-loader 0.8s linear infinite;"></span>
      <span>Scraping latest intelligence feeds...</span>
    </div>
  `;

  // Define spin animation dynamically if it doesn't exist
  if (!document.getElementById('spin-loader-keyframes')) {
    const style = document.createElement('style');
    style.id = 'spin-loader-keyframes';
    style.innerHTML = `
      @keyframes spin-loader {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  setTimeout(() => {
    // Select 5 different articles from the pool
    const pool = weeklyIntelligence.filter(item => {
      if (activeIntelWeekKey === 'current') {
        return item.category === catName && item.daysAgo >= 0 && item.daysAgo < 7;
      } else if (activeIntelWeekKey === 'previous') {
        return item.category === catName && item.daysAgo >= 7 && item.daysAgo < 14;
      }
      return false;
    });

    if (pool.length > 0) {
      // Pick 5 random items (or all if pool is <= 5)
      const shuffled = [...pool].sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, Math.min(5, pool.length));
      
      sectorDisplayMap[activeIntelWeekKey + '_' + catName] = selected.map(item => item.id);
    }

    gridEl.style.opacity = '1';
    renderSectorCards(catName, gridEl);
  }, 650);
}
window.refreshSector = refreshSector;

function renderIntelligenceBrief(weekKey) {
  activeIntelWeekKey = weekKey;
  const feedContainer = document.getElementById('intel-feed-container');
  if (!feedContainer) return;

  // Filter articles based on active week / bookmarks
  let filteredItems = [];
  if (weekKey === 'bookmarks') {
    filteredItems = weeklyIntelligence.filter(item => userBookmarkedIntel.includes(item.id));
  } else {
    filteredItems = weeklyIntelligence.filter(item => {
      if (weekKey === 'current') {
        return item.daysAgo >= 0 && item.daysAgo < 7;
      } else if (weekKey === 'previous') {
        return item.daysAgo >= 7 && item.daysAgo < 14;
      }
      return false;
    });
  }

  if (filteredItems.length === 0) {
    feedContainer.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #666; background: #111; border: 1px solid #333; border-radius: 8px;">
        <p style="margin: 0; font-size: 1rem;">No intelligence items found in this section.</p>
      </div>
    `;
    return;
  }

  // Group items by category
  const categories = {};
  filteredItems.forEach(item => {
    if (!categories[item.category]) {
      categories[item.category] = [];
    }
    categories[item.category].push(item);
  });

  // Build HTML
  let html = '';
  Object.keys(categories).forEach(catName => {
    const items = categories[catName];
    
    // Category header icon helper
    let icon = '👔';
    if (catName.includes('Sponsorship')) icon = '🤝';
    if (catName.includes('AI') || catName.includes('Tech')) icon = '🤖';

    // Set up display map for this week and category if it doesn't exist
    const displayKey = weekKey + '_' + catName;
    if (weekKey === 'bookmarks') {
      // For bookmarks, we always display all of them
      sectorDisplayMap[displayKey] = items.map(item => item.id);
    } else if (!sectorDisplayMap[displayKey]) {
      // Pick first 5 items by default
      sectorDisplayMap[displayKey] = items.slice(0, 5).map(item => item.id);
    }

    const gridId = `sector-grid-${catName.replace(/[^a-z0-9]/gi, '-').toLowerCase().replace(/-+/g, '-')}`;

    // Header has a "Refresh" button only for weekly lists
    const refreshButton = weekKey !== 'bookmarks'
      ? `<button class="sector-refresh-btn" onclick="refreshSector('${escapeHTML(catName)}')" style="background: transparent; border: 1px solid #444; color: #aaa; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 0.75rem; transition: all 0.2s; display: inline-flex; align-items: center; gap: 4px;" title="Scrape latest updates">
           <span>↻</span> <span>Refresh Sector</span>
         </button>`
      : '';

    html += `
      <div style="background: linear-gradient(135deg, #111 0%, #0a0a0a 100%); border: 1px solid #333; border-radius: 8px; padding: 25px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #222; padding-bottom: 8px;">
          <h3 style="color: #c8a97e; margin: 0; font-size: 1.3rem; display: flex; align-items: center; gap: 10px;">
            <span>${icon}</span> <span>${escapeHTML(catName)}</span>
          </h3>
          ${refreshButton}
        </div>
        <div id="${gridId}" style="display: grid; grid-template-columns: 1fr; gap: 20px; transition: opacity 0.3s ease;">
          <!-- Populated by renderSectorCards -->
        </div>
      </div>
    `;
  });

  feedContainer.innerHTML = html;

  // Render cards for each category
  Object.keys(categories).forEach(catName => {
    const gridId = `sector-grid-${catName.replace(/[^a-z0-9]/gi, '-').toLowerCase().replace(/-+/g, '-')}`;
    const gridEl = document.getElementById(gridId);
    if (gridEl) {
      renderSectorCards(catName, gridEl);
    }
  });
}

function initIntelligenceCenter() {
  const tabs = document.querySelectorAll('.intel-tab');
  if (!tabs.length) return;

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active classes
      tabs.forEach(t => t.classList.remove('active'));
      // Add active to current
      tab.classList.add('active');

      const weekKey = tab.getAttribute('data-week');
      renderIntelligenceBrief(weekKey);
    });
  });

  // Initial render
  renderIntelligenceBrief('current');
}

async function loadOpportunities() {
  const feed = document.getElementById('opportunities-feed');
  if (!feed) return;

  try {
    const qSnap = await getDocs(query(collection(db, "opportunities"), orderBy("createdAt", "desc")));
    let html = '';

    qSnap.forEach(docSnap => {
      const opp = docSnap.data();
      const oppId = docSnap.id;

      const title = escapeHTML(opp.title || 'No Title');
      const category = escapeHTML(opp.category || 'Job');
      const description = escapeHTML(opp.description || 'No description provided');
      const authorName = escapeHTML(opp.authorName || 'Anonymous');
      const authorEmail = escapeHTML(opp.authorEmail || '');
      const authorUid = opp.authorUid;

      // Show Delete button if current user is the author OR if they are an admin
      let deleteBtn = '';
      if (currentUserUid === authorUid || isAdmin) {
        deleteBtn = `
          <button class="delete-opportunity-btn" data-id="${oppId}" style="background: #ef4444; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 0.85rem; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#dc2626'" onmouseout="this.style.background='#ef4444'">
            Delete
          </button>
        `;
      }

      html += `
        <div style="background: #111; padding: 20px; border-radius: 8px; border: 1px solid #333; margin-bottom: 15px; position: relative;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 5px;">
            <span style="color: #c8a97e; font-size: 0.8rem; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px;">${category}</span>
            <span style="color: #666; font-size: 0.8rem;">Posted by ${authorName}</span>
          </div>
          <h4 style="margin: 5px 0; font-size: 1.2rem; color: #fff;">${title}</h4>
          <p style="color: #aaa; margin: 0 0 15px 0; font-size: 0.95rem; line-height: 1.5; white-space: pre-wrap;">${description}</p>
          <div style="display: flex; gap: 10px; align-items: center;">
            <button class="view-opp-contact-btn" data-email="${authorEmail}" style="background: transparent; border: 1px solid #555; color: #fff; padding: 6px 15px; border-radius: 4px; cursor: pointer; font-size: 0.85rem; transition: border-color 0.2s;" onmouseover="this.style.borderColor='#c8a97e'" onmouseout="this.style.borderColor='#555'">
              Contact Author
            </button>
            ${deleteBtn}
          </div>
        </div>
      `;
    });

    if (qSnap.size === 0) {
      feed.innerHTML = `<p style="color: #666; padding: 20px; text-align: center; background: #080808; border-radius: 8px; border: 1px dashed #222;">No opportunities posted yet. Be the first to share one!</p>`;
    } else {
      feed.innerHTML = html;

      // Attach Contact Author click handlers
      document.querySelectorAll('.view-opp-contact-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const email = e.currentTarget.getAttribute('data-email');
          window.location.href = `mailto:${email}?subject=SES Opportunities Marketplace - Inquiry`;
        });
      });

      // Attach Delete click handlers
      document.querySelectorAll('.delete-opportunity-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          if (!confirm("Are you sure you want to delete this opportunity post?")) return;

          const oppId = e.currentTarget.getAttribute('data-id');
          try {
            await deleteDoc(doc(db, "opportunities", oppId));
            loadOpportunities(); // Refresh the feed
          } catch(err) {
            console.error("Error deleting opportunity:", err);
            alert("Failed to delete post. Try again.");
          }
        });
      });
    }

  } catch (err) {
    console.error("Error loading opportunities:", err);
    feed.innerHTML = `<p style="color: red;">Error loading marketplace feed.</p>`;
  }
}

function initOpportunities() {
  const btnPost = document.getElementById('btn-post-opportunity');
  const modal = document.getElementById('post-opportunity-modal');
  const btnClose = document.getElementById('close-opportunity-modal-btn');
  const form = document.getElementById('post-opportunity-form');

  if (!btnPost || !modal || !btnClose || !form) return;

  // Open Modal
  btnPost.addEventListener('click', () => {
    form.reset();
    modal.style.display = 'flex';
  });

  // Close Modal
  btnClose.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  // Handle Form Submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = document.getElementById('opportunity-title').value.trim();
    const category = document.getElementById('opportunity-category').value;
    const description = document.getElementById('opportunity-description').value.trim();

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerText = 'Posting...';
    }

    try {
      // Create opportunity doc in Firestore
      await addDoc(collection(db, "opportunities"), {
        title,
        category,
        description,
        authorUid: currentUserUid,
        authorEmail: auth.currentUser.email,
        authorName: currentUserName,
        createdAt: serverTimestamp()
      });

      modal.style.display = 'none';
      form.reset();
      loadOpportunities(); // Reload the feed!

    } catch (err) {
      console.error("Error posting opportunity:", err);
      alert("Failed to post opportunity. Please try again.");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerText = 'Post to Marketplace';
      }
    }
  });
}

function initManualInvite() {
  const addInviteBtn = document.getElementById('admin-add-invite-btn');
  const inviteModal = document.getElementById('invite-user-modal');
  const closeModalBtn = document.getElementById('close-invite-modal-btn');
  const inviteForm = document.getElementById('invite-user-form');

  if (!addInviteBtn || !inviteModal || !closeModalBtn || !inviteForm) return;

  // Open Modal
  addInviteBtn.addEventListener('click', () => {
    inviteForm.reset();
    inviteModal.style.display = 'flex';
  });

  // Close Modal
  closeModalBtn.addEventListener('click', () => {
    inviteModal.style.display = 'none';
  });

  // Handle Form Submission
  inviteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('invite-name').value.trim();
    const email = document.getElementById('invite-email').value.trim().toLowerCase();
    const tier = document.getElementById('invite-tier').value;
    const company = document.getElementById('invite-company').value.trim();
    const title = document.getElementById('invite-title').value.trim();

    const submitBtn = inviteForm.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerText = 'Creating...';
    }

    try {
      // 1. Create an application record with status: 'approved'
      const appRef = doc(collection(db, "applications"));
      await setDoc(appRef, {
        email: email,
        fullName: name,
        phone: '',
        company: company,
        title: title,
        referrer: 'Admin Panel Invite',
        tier: tier,
        industries: [],
        clientele: '',
        experience: 'Manually invited by Admin',
        status: 'approved',
        applicationType: 'manual',
        createdAt: serverTimestamp()
      });

      // 2. Add to approved_emails registry so they can register
      await setDoc(doc(db, "approved_emails", email), {
        email: email,
        membershipTier: tier,
        approvedAt: serverTimestamp(),
        registered: false
      });

      // 3. Hide Modal and Refresh List
      inviteModal.style.display = 'none';
      alert(`Invitation successfully created for ${name}!`);
      loadAdminApplications();
      
    } catch (err) {
      console.error("Error creating manual invite:", err);
      alert("Failed to create invitation. Please try again.");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerText = 'Create Invite';
      }
    }
  });
}

const promptLibrary = {
  negotiation: {
    title: "Negotiation Tactics Prompts",
    prompts: [
      {
        title: "Prompt 1 (Inner Beast Alignment)",
        text: "Act as an expert negotiator. I am entering a high-stakes discussion. Help me identify the other party's 'Inner Beast'—are they a fast and fiery Falcon, a quiet and strategic Owl, or an expressive Dolphin? Generate a script that allows me to match their instinctive communication style so I can build trust without losing my leverage."
      },
      {
        title: "Prompt 2 (Ego & Pace Control)",
        text: "Provide a framework for a luxury real estate negotiation where egos and pride are heavily involved. Give me tactics on how to read the room, control the pace, and know exactly when to push forward and when to pause."
      },
      {
        title: "Prompt 3 (Defending Premium Value)",
        text: "Draft talking points for a client trying to negotiate my fees down. I refuse to be the low-cost leader. Give me a script that pivots the conversation away from price and reinforces the exclusive, chauffeur-driven experience and unparalleled expertise they will receive by working with me."
      }
    ]
  },
  sponsor: {
    title: "Sponsor Outreach Email Prompts",
    prompts: [
      {
        title: "Prompt 1 (The Warm Gatekeeper Intro)",
        text: "Draft a concise, professional outreach email to a sports agent I was recently introduced to. The email should not ask for business outright. Instead, offer them exclusive, off-market industry information that they can share with their clients to make themselves look like a hero."
      },
      {
        title: "Prompt 2 (The Co-Branding Pitch)",
        text: "Write an email to a non-competing luxury lifestyle brand (e.g., a high-end car dealership) proposing a strategic co-branding partnership for an upcoming event. Emphasize how sharing our affluent databases will result in mutual exposure and elevated prestige."
      },
      {
        title: "Prompt 3 (The 'Forget Me Not' Follow-Up)",
        text: "Create a brief 'Forget Me Not' email template to send to a past high-net-worth client. It should be a quarterly touch-base that provides a highly relevant, valuable market update without sounding 'salesy' or intrusive."
      }
    ]
  },
  media: {
    title: "Media Interview Prep Prompts",
    prompts: [
      {
        title: "Prompt 1 (Reframing Failure via F.A.I.L.)",
        text: "I have a media interview where I may be asked about a past business setback or a property that didn't sell. Help me draft a response that reframes this using the F.A.I.L. framework—'Find All Important Lessons'—to show how the experience ultimately elevated my career and expertise."
      },
      {
        title: "Prompt 2 (Selling the Lifestyle Story)",
        text: "Generate talking points for an upcoming interview about a luxury listing. Instead of listing facts and square footage, craft an emotional story that sells the legacy, exclusivity, and lifestyle of the estate to appeal to the avatar of a billionaire buyer."
      },
      {
        title: "Prompt 3 (Brand Mantra Integration)",
        text: "Draft three 30-second soundbites that seamlessly integrate my core brand mantra, 'Focus and Finish,' into general business advice. The tone should be inspirational, authoritative, and emphasize the importance of focusing on small steps to achieve massive goals."
      }
    ]
  }
};

function initPromptLibrary() {
  const items = document.querySelectorAll('.prompt-category-item');
  const modal = document.getElementById('prompts-viewer-modal');
  const btnClose = document.getElementById('close-prompts-modal-btn');
  const container = document.getElementById('prompts-container');
  const titleEl = document.getElementById('prompts-modal-title');

  if (!modal || !btnClose || !container || !titleEl) return;

  items.forEach(item => {
    item.addEventListener('click', (e) => {
      const catKey = e.currentTarget.getAttribute('data-category');
      const catData = promptLibrary[catKey];
      if (!catData) return;

      titleEl.innerText = catData.title;
      container.innerHTML = '';

      catData.prompts.forEach((prompt, idx) => {
        const promptId = `prompt-${catKey}-${idx}`;
        const card = document.createElement('div');
        card.style.cssText = 'background: #111; border: 1px solid #222; border-radius: 6px; padding: 20px; box-sizing: border-box;';

        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid #222; padding-bottom: 8px;">
            <h4 style="margin: 0; color: #c8a97e; font-size: 1rem; font-weight: bold;">${prompt.title}</h4>
            <button class="copy-prompt-btn" data-target="${promptId}" style="background: transparent; border: 1px solid #c8a97e; color: #c8a97e; padding: 4px 10px; border-radius: 4px; font-size: 0.75rem; cursor: pointer; transition: all 0.2s; font-weight: bold;">Copy Prompt</button>
          </div>
          <div id="${promptId}" style="color: #ccc; font-size: 0.9rem; line-height: 1.5; white-space: pre-wrap; font-family: monospace; background: #070707; padding: 12px; border-radius: 4px; border: 1px solid #1a1a1a;">${prompt.text}</div>
        `;

        container.appendChild(card);
      });

      // Attach Copy Event Listeners
      container.querySelectorAll('.copy-prompt-btn').forEach(btn => {
        btn.addEventListener('click', (ev) => {
          const targetId = ev.currentTarget.getAttribute('data-target');
          const promptTextDiv = document.getElementById(targetId);
          if (promptTextDiv) {
            navigator.clipboard.writeText(promptTextDiv.innerText)
              .then(() => {
                ev.currentTarget.innerText = 'Copied!';
                setTimeout(() => { ev.currentTarget.innerText = 'Copy Prompt'; }, 2000);
              })
              .catch(err => {
                console.error("Clipboard copy failed:", err);
              });
          }
        });
      });

      modal.style.display = 'flex';
    });
  });

  btnClose.addEventListener('click', () => {
    modal.style.display = 'none';
  });
}

const playbookVault = {
  "sports-partnership": {
    title: "Sports Partnership Playbook",
    files: [
      {
        title: "The \"Chauffeur-Driven\" Service Model",
        author: "Kofi Nartey",
        content: `<h3>The "Chauffeur-Driven" Service Model</h3>
<p style="font-style: italic; color: #666; margin-bottom: 25px;">By Kofi Nartey</p>

<p>When servicing athletes and entertainers, it is essential to understand the intricate psychology and daily reality of the "Chauffeur-Driven" life they lead. High-profile clients do not hire a chauffeur simply because they lack the ability to drive; they do it because they deeply desire a specific, elevated experience, and they recognize that their time is a premium asset better allocated to their craft, their families, or their leisure. In the world of elite performance, time and mental energy are invaluable currencies. Actors and professional athletes are highly accustomed to a pampered lifestyle from the moment they reach the upper echelons of their industries. As Kofi Nartey notes from his own experiences as a professional football player and an actor, high-profile individuals frequently fly around the world in first class, are chauffeured to and from locations in luxury vehicles, stay exclusively in four- and five-star hotels, and frequently dine at the absolute finest establishments.</p>

<p>Because of this constant exposure to top-tier treatment, these individuals develop a baseline expectation for how services should be delivered. <strong>As a service provider, your standard must align flawlessly with this level of luxury.</strong> Affluent individuals are accustomed to personalized, tailored experiences that cater to their unique preferences, and they associate higher price tags with superior levels of expertise, convenience, service, and quality. You cannot expect to win over or retain a celebrity client if your business model reflects mass-market generalizations. Instead, your entire brand must symbolize a promise—a guarantee of unparalleled service, discretion, and exclusivity. When an athlete or entertainer decides to hire you, they are not just buying a product or a basic service; they are buying into an experience that reflects their own sophistication and prestige. Therefore, you must present yourself and your business as the premier expert in your field, proving that you alone possess the distinct mix of benefits capable of meeting their lifestyle needs.</p>

<h4>Removing Stress and Friction</h4>
<p>The ultimate goal of the chauffeur-driven model is to allow the athlete or entertainer to focus entirely on their craft or game. In the sports world, for instance, professional organizations go to great lengths to ensure their athletes are not distracted by day-to-day inconveniences. They provide chartered planes, meticulously catered meals, and seamless ground transportation so that players never have to worry about logistical details. The entire infrastructure is designed with one singular objective: the athlete must be able to focus solely on winning, while everything else is handled behind the scenes by a team of experts.</p>

<p>Your business process must emulate this by actively anticipating challenges and removing all stress and friction from the transaction. You must allow your clients the exact same peace of mind they receive from their teams or studios—the absolute certainty that the business they transact with you will be handled flawlessly, without a hitch, and with as little active involvement required from them as possible. To achieve this friction-free environment, you must act as a fierce advocate and protector. High-profile athletes and entertainers are frequently targeted by predators or individuals looking to overcharge them simply because they possess significant wealth. You must be tough enough to stand up, negotiate aggressively on their behalf, and protect their best interests and bank accounts from price gouging.</p>

<p>Furthermore, removing friction means ensuring absolute discretion. Athletes and entertainers live highly public work lives, but they deeply value and protect the privacy of their personal lives. Removing stress means implementing strict confidentiality agreements with your team and ensuring that no detail about your client's home, schedule, or personal preferences ever leaks to the public or the paparazzi. By treating your business as a "team sport" and surrounding yourself with a vetted ecosystem of trusted, premium vendors, you can seamlessly handle complex problems behind the scenes before the client ever feels the burden. When you make it your priority to execute your job in a way that shields your client from stress, you give them the freedom to focus entirely on their career and their family.</p>

<h4>Delivering a Concierge-Level Experience</h4>
<p>To truly stand out in this competitive niche, your service must transcend a standard transaction and become a bespoke, highly curated experience. This is much like the decision to fly first class or choose an airline like Virgin Airlines, where consumers happily pay premium prices because the company has built its entire brand on delivering an extraordinary, unforgettable flying experience. Every interaction your client has with you must be imbued with luxury, personalized service, and a deep understanding of their unspoken needs.</p>

<ul>
  <li><strong>Anticipation of Needs:</strong> True luxury means staying significantly ahead of your clients' wants by providing conveniences and solutions before it even occurs to them to ask. Anticipation requires meticulous research, constant feedback, creativity, and a willingness to step outside the status quo. You must understand the unique trajectory of their careers and the specific demands of their daily lives. For example, if you know a client is moving to a new city for a short-term contract, true anticipation means proactively advising them on the best short-term living arrangements and having the logistics solved before they even arrive. It means observing their habits and preferences closely so that you can craft "wow" moments—unexpected, delightful surprises that leave a lasting impression.</li>
  <li><strong>Comprehensive Offerings:</strong> Consider offering full-scale concierge services that extend far beyond your core professional duties. In luxury real estate, for example, this means providing not just the home, but acting as the central hub for their entire transition. A true concierge-level relocation means that when the client arrives, they are greeted by a house that is already fully furnished, the refrigerator is fully stocked with their specific dietary preferences, and their clothes are perfectly color-coordinated in the closets by professional organizers. It means having exclusive car services, personal chefs, private yacht charters, and restaurant concierges readily available on speed dial. By serving as the reliable hub of a finely tuned network, you deliver everything they need seamlessly, making the impossible happen at a moment's notice.</li>
  <li><strong>Flexibility and Adaptability:</strong> Celebrities have incredibly volatile schedules. In this industry, there is a saying that "time waits for no one... except celebrities". Their availability changes faster than the weather, and you must be highly flexible, ready for last-minute calls, sudden cancellations, and constant rescheduling. You must be willing to adapt to odd hours, late-night requests, and sudden shifts in plans to meet their lifestyle demands without a single complaint. If a business manager calls to inform you that an athlete is flying into town in two hours and wants to immediately preview six properties, your mindset must instantly shift to, "Let the games begin". You must view these rapid, highly demanding requests not as an inconvenience, but as the perfect opportunity to separate yourself from your competition by proving your elite adaptability.</li>
</ul>

<h4>The Key Takeaway</h4>
<p>In the rarified air of sports and entertainment, the client experience is becoming more important than ever, to the point that the experience itself is just as important as the product you are selling. The highest-level clients are not just buying a physical asset or a standard service; they are buying into a feeling, a lifestyle, and a promise of excellence.</p>

<p>Service for this niche often reinforces the status of these individuals. Because they are accustomed to the very best the world has to offer, they are looking to you to make them feel important, valued, and completely understood. If you can successfully execute a comprehensive process that shields your client from logistical headaches and emotional friction, while simultaneously reinforcing their elite status and making them feel profoundly important, you will cultivate a full roster of lifelong clients.</p>

<p>In the luxury market, building customer loyalty is not merely about securing repeat business; it is about creating fierce advocacy. When clients experience a level of service that consistently exceeds their expectations, they do not just return—they become vocal ambassadors for your brand among their highly influential peers. Athletes, in particular, spend countless hours with their teammates and frequently seek referrals from within their locker rooms. If you take flawless care of one player, you will often earn direct referrals to their teammates. By remaining a reliable, indispensable resource for every part of their luxury lifestyle, you ensure that you are always their first call, embedding yourself into their world as a trusted advisor. Ultimately, this relentless commitment to delivering an exclusive, chauffeur-driven experience is what transforms a single transaction into a lasting, incredibly lucrative business legacy.</p>`
      }
    ]
  },
  "executive-branding": {
    title: "Executive Branding Guide",
    files: [
      {
        title: "THE BRAND PROMISE & SOUL",
        author: "Kofi Nartey",
        content: `<h3>THE BRAND PROMISE & SOUL</h3>
<p style="font-style: italic; color: #666; margin-bottom: 25px;">By Kofi Nartey</p>

<h4>Deconstructing the Myth of the Logo</h4>
<p>When most professionals sit down to design their business identity, they obsess over color palettes, typography, and graphic design. However, your brand is not a logo, a PDF, or a simple marketing file; it is a living force that breathes every single time someone experiences you or your work. In today’s highly competitive landscape, where physical products can be easily copied and specialized services are quickly commoditized, your brand serves as your definitive edge.</p>

<p>Your brand is not merely a description of what you do—it represents how you do it, what core principles you stand for, and, most importantly, how people feel after interacting with you. Ultimately, your brand symbolizes a solemn promise to your client. It is a guarantee of the specific experiences, tangible benefits, and intangible emotions that customers can expect when they choose to utilize your product or service. The highest-level clients in sports, entertainment, and luxury do not simply buy homes or basic advisory services; they buy into curated experiences, prestigious lifestyles, and elite reputations. Therefore, your brand must stand as an unshakeable promise of what the experience of working with you will actually be.</p>

<h4>Defining a Core Belief to Create Brand Gravity</h4>
<p>The most magnetic, unforgettable brands in the world are anchored by a strong, definitive belief system. For example, Nike does not just sell athletic shoes; it stands for the power of human potential, while Patagonia stands for environmental responsibility above its own profits. When you define a clear, unwavering belief, it gives your brand immense gravity. This gravity acts as a filter that naturally attracts the right people to your business while simultaneously repelling the wrong ones.</p>

<p>When you know exactly what you stand for, your internal decisions become easier to navigate, your external messaging becomes sharper, and your entire team becomes deeply aligned. For example, the real estate and development firm Globl RED defined its core belief as "Inspirational Excellence". This means the company does not simply strive to be the best in the industry; it actively seeks to inspire people along the entire journey. They are not there to conduct business as usual, but to profoundly elevate the lives of everyone involved in the transaction.</p>

<p>This specific core belief shapes everything the company touches: its marketing materials, its customer service protocols, its strategic partnerships, and its internal workplace culture. It transforms a simple corporate motto into a driving mission. If you want to create a legacy brand, you must identify a core belief that gives your company this exact type of gravity. When a brand is infused with a deeper purpose and soul, it energizes the people who interact with it, helping clients feel empowered, elevated, and inspired while achieving their goals.</p>

<h4>Emotional Connection: Why People Buy Feelings</h4>
<p>A fundamental truth of human psychology and sales is that people do not buy products—they buy feelings. A boutique hotel does not just sell a bed to sleep in; it sells the feeling of being intimately seen and cared for, just as a luxury brand sells aspiration and identity.</p>

<p>When examining consumer behavior, it is critical to understand that most buying decisions are made emotionally and then justified intellectually later. People make high-stakes purchases based on how they currently feel, or how they anticipate they will feel once the transaction is finalized. Therefore, your brand must be strategically designed to produce a specific emotional response or connection, especially when targeting athletes, entertainers, and other affluent individuals.</p>

<p>In the luxury market, trust is arguably the most powerful emotion you can evoke. Trust is the most significant factor high-net-worth individuals consider when selecting business professionals, and if your brand can instantly evoke a feeling of trust, you are already halfway to earning their business. When your brand makes people feel something deeply meaningful, you forge an emotional connection, and that emotional connection is the exact place where lifelong client loyalty lives.</p>

<h4>Delivering on the Promise at Every Touchpoint</h4>
<p>Every brand makes a promise, but only great brands deliver on it consistently. Think of industry giants: FedEx promises overnight delivery and builds its entire logistical operation to ensure it happens, while Starbucks promises a consistent experience so you know exactly what to expect anywhere in the world. When your brand consistently keeps its promise, you earn the client's trust; that trust evolves into loyalty, and that loyalty transforms into unstoppable business momentum.</p>

<p>The client's experience following their initial engagement with you is what creates the ultimate, lasting impression of your brand. This means that every single interaction, or "touchpoint," is a vital opportunity to demonstrate and reiterate your value proposition. For instance, if a core tenet of your brand promise is elite responsiveness, then every interaction with your client must be prompt, complete, and include follow-up to ensure absolute thoroughness.</p>

<p>At Globl RED, the brand promise is "Delivering Desired Results Through Inspirational Excellence," and this is upheld from the very first phone call to the final closing and beyond. Whether they are marketing a luxury estate, negotiating a complex deal, or supporting a high-profile celebrity behind the scenes, the goal is always to inspire the client with the process while overdelivering on the actual results. Clients return, offer referrals, and rave about the brand not just because excellence was delivered, but because it was delivered in a way that uplifted and motivated them.</p>

<h4>The Five Cs of Executing a Lasting Brand</h4>
<p>To ensure your brand's soul translates to the public, you must execute your messaging flawlessly. When building and pushing your brand out into the world, you should follow the "Five Cs" of marketing: Clean, Concise, Clear, Consistent, and Constant.</p>

<ul>
  <li><strong>Clean:</strong> Your brand imagery and messaging cannot be cluttered or messy. It must reflect the luxury and sophistication of the clients you aim to serve.</li>
  <li><strong>Concise:</strong> Your messaging must be brief and impactful. People should not have to work hard to figure out what you or your company does.</li>
  <li><strong>Clear:</strong> You must be absolutely clear about what the product is, what the service entails, and exactly who you are servicing.</li>
  <li><strong>Constant:</strong> You must put your brand in front of people constantly on a regular basis.</li>
  <li><strong>Consistent:</strong> Your brand identity must be uniform across all platforms. If a prospective client engages with your brand on social media, visits your website, or reads your printed materials, the brand messaging, logos, and colors must be completely consistent.</li>
</ul>

<p>When you apply the Five Cs, you increase your audience's "time on brand". Time on brand is critical because it creates Mindshare. Mindshare dictates that when a consumer thinks of a specific product or service category, your name is the very first one that comes to their mind. For example, when someone says "soda," you might immediately think of Coke or Pepsi because those brands have dominated household mindshare. In your specific niche, your goal is to ensure that when an athlete or entertainer thinks of your industry, they immediately think of your brand because of your constant and consistent messaging.</p>

<h4>Storytelling as the Ultimate Brand Reinforcement</h4>
<p>To truly cement your brand's soul, you must transition from simple self-promotion into the art of storytelling. You must build your value proposition directly into the stories you tell. It is one thing to boldly claim, "I am great because I offer excellent service," but it is an entirely different, far more powerful strategy to say, "I was able to help this specific client in this highly unique situation to ultimately deliver on their desired outcome," and then provide the exact narrative.</p>

<p>People will remember how a story makes them feel long after they have forgotten the specific statistics of your promotional material. This storytelling aspect is a critical key to making your brand last because it humanizes your promise and provides undeniable social proof of your excellence.</p>

<h4>Evolving with Purpose</h4>
<p>Finally, a brand with a true soul must be willing to evolve, but it must do so with profound purpose. If you do not have an underlying driver or a deep "why" for what you are doing, you risk burning out quickly and losing the vision of your brand. You must constantly ask yourself why your work matters, and why it is important that people choose to work with you instead of your competitors. If you genuinely care about your clients and truly believe that your product or service is the absolute best option for them, you will fiercely advocate for them to work with you because you know their ultimate outcome will be superior.</p>

<h4>The Key Takeaway</h4>
<p>When you commit to building a brand, remember that you are building a living force. You must ask yourself: What do I stand for? How do I want people to feel after interacting with my brand? What promise do I make—and how consistently do I fulfill it? Once you answer these questions, you must relentlessly commit to aligning every single piece of your brand—your voice, your visuals, your core values, and your daily actions—around those specific answers.</p>

<p>If you just slap a logo on a website without building the internal infrastructure and establishing a core belief, your brand will develop randomly without your intentional input. But when your brand is crafted with extreme clarity, deep emotion, and uncompromising integrity, it transcends traditional marketing. It becomes something far more powerful—it becomes a movement. Start by clearly defining your brand promise, and ensure that every action you take rises to meet it.</p>`
      }
    ]
  },
  "board-seat": {
    title: "Board Seat Playbook",
    files: [
      {
        title: "THE 4 NETWORKING FILTERS FOR INFLUENCE",
        author: "Globl Consulting",
        content: `<h3>THE 4 NETWORKING FILTERS FOR INFLUENCE</h3>
<p style="font-style: italic; color: #666; margin-bottom: 25px;">Introduction: Redefining the Art of Connection</p>

<p>In today's fast-paced, hyper-connected business landscape, networking is often profoundly misunderstood. Many professionals view it as a transactional numbers game—a frantic race of collecting contacts, shaking hands, and indiscriminately passing out business cards at industry events. However, if your ultimate objective is to secure board seats, establish high-level strategic alliances, or embed yourself within the inner circles of the elite, this superficial approach will inevitably fail.</p>

<p>Gone are the days when networking merely meant exchanging contact information; true networking is about creating authentic, reciprocal relationships that bring immense value to everyone involved. The highest levels of success rarely happen in isolation; they are the result of a carefully cultivated web of meaningful relationships that amplify your focus, creativity, and overall impact.</p>

<p>For a connection to evolve from a fleeting social interaction into a powerful opportunity—whether in business, life, or legacy building—it must successfully navigate through a specific sequence of stages. This framework, known as the "Four Networking Filters," represents the precise method for moving beyond proximity and into genuine influence. When all four of these filters are successfully in place, powerful, life-changing relationships are born; if you miss even one, the connection will likely fade into just another forgotten conversation.</p>

<hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />

<h4>Filter 1: Who You Know (Access to the Room)</h4>
<p><strong>The Foundation of Access</strong><br />
The journey to high-level influence begins with a fundamental reality: <strong>It starts with access</strong>. You simply cannot build strategic relationships if you are not in the right rooms—or at least actively working to get into them. "Who you know" establishes the baseline foundation of your network. These are the individuals you have met, been formally introduced to, or crossed paths with in business, community, or social settings.</p>

<p>Think of this first filter like a blank contact list or a foundational ledger—you must have names in the book before you can begin building bridges. However, a critical mistake many professionals make is assuming that the work stops here. <strong>Knowing someone does not automatically build a relationship</strong>. Proximity is not the same as partnership.</p>

<p><strong>Applying Intentionality</strong><br />
To successfully navigate this first filter, you must apply extreme <em>Intentionality</em>. Effective networking requires you to approach each interaction with a clear understanding of your long-term goals and core values. When you know exactly what you are trying to achieve—such as securing a specific board seat or aligning with a particular industry leader—you are much better equipped to seek out the individuals and opportunities that align with those high-level aspirations.</p>

<p>This targeted, intentional approach saves you vital time and energy, ensuring you aren't just mingling aimlessly, but rather placing yourself in the specific environments where your target alliances operate. You must ask yourself: <em>What am I hoping to achieve through this connection?</em>. By defining your purpose, you can strategically curate your presence so that you are consistently stepping into the rooms that matter most.</p>

<hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />

<h4>Filter 2: Who Also Knows You (Visibility and Memorability)</h4>
<p><strong>Moving from Proximity to Connection</strong><br />
Filter 2 is where the vast majority of professionals drop the ball. They expend all their energy getting into the VIP room, but once they arrive, they focus entirely on proximity instead of genuine connection. The harsh truth of high-level networking is this: <strong>Just because you know who they are, does not mean they know <em>you</em></strong>. And if the key decision-makers and influencers do not know who you are, there is absolutely no foundation to build trust or create future opportunity.</p>

<p>To secure a high-level alliance, you must transition from being a face in the crowd to a recognized presence. You must make sure you are actively being <em>seen</em>, not just standing nearby hoping to be noticed.</p>

<p><strong>Creating Moments of Genuine Engagement</strong><br />
Visibility is achieved by creating moments for genuine, authentic engagement. This means establishing strong eye contact, initiating meaningful conversation, and facilitating warm, personal introductions. Your presence must leave a distinct and lasting impression.</p>

<p>To do this effectively, you must lean into <em>Authenticity</em>. People are naturally drawn to those who show up as their true selves, devoid of pretense or hidden, transactional agendas. Authentic connections form when we allow others to see us for who we truly are, rather than putting up a corporate facade.</p>

<p><strong>The One-Thing Rule</strong><br />
A highly effective, actionable strategy to implement in this filter is the "One-Thing Rule." In any first-time encounter with a high-level contact, <strong>aim to say exactly <em>one thing</em> about yourself that makes you deeply memorable</strong>. It does not have to be flashy, boastful, or over-the-top; it simply needs to be real and authentic. Your goal is to give the other person a specific anchor to recall you by—a unique detail, a shared passion, or an interesting background fact that lingers in their mind long after the event has ended.</p>

<hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />

<h4>Filter 3: Who Knows What You Do (Planting the Seed Through Storytelling)</h4>
<p><strong>The Bridge from Social to Strategic</strong><br />
Once you have gained access to the room and established your visibility, you must navigate the third filter: ensuring they understand your value. This filter serves as the vital bridge from a purely social interaction to a strategic business alliance. If an influential leader or board member does not know what you do, they cannot possibly connect the dots between your unique talents and their organization's needs.</p>

<p>However, there is a delicate nuance to this filter that separates amateurs from master networkers. <strong>It does not have to be a pitch</strong>. In fact, it <em>should not</em> be a pitch. Unloading your entire professional resume or delivering a rapid-fire, 30-second elevator pitch the moment you meet someone is aggressive and off-putting.</p>

<p><strong>Planting the Seed Through Storytelling</strong><br />
Instead of pitching, your objective is to <em>plant the seed</em>. The most effective way to plant this seed is through the art of storytelling. Human beings are hardwired for narrative; <strong>people remember stories significantly more than they remember sterile job titles or lists of accolades</strong>.</p>

<p>Give the person a simple, relatable example of your work—a narrative that highlights your expertise in action. The goal is to provide them with a compelling soundbite that they can easily retell if your name comes up in a boardroom discussion later. For example, instead of saying, "I am a luxury real estate broker," you might say, "I help athletes and entertainers build real estate portfolios that outlast their playing careers". That statement is intriguing, highly specific, and naturally opens the door to a deeper conversation without sounding like a solicitation.</p>

<p><strong>Value Creation First</strong><br />
This filter is deeply tied to the concept of <em>Value Creation</em>. Value creation is a powerful strategy that involves giving before expecting anything in return. When you tell a story that highlights your expertise, you are subtly demonstrating how you solve complex problems and add value. By proactively looking for ways to position your skills as a resource for others, you build a stellar reputation as someone who is generous, resourceful, and capable of operating at the highest levels.</p>

<hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />

<h4>Filter 4: Who Likes You (Being Interested, Rather Than Interesting)</h4>
<p><strong>The Ultimate Deciding Factor</strong><br />
You can be in the right room, be highly visible, and perfectly articulate your value, but if you fail the fourth filter, the opportunity will die. At the end of the day, the fundamental rule of business applies, especially at the highest echelons: <strong>People do business with people they like</strong>. Period.</p>

<p>When securing board seats or elite partnerships, decision-makers are not just evaluating your resume; they are evaluating your character. They are asking themselves, "Do I want to sit in a boardroom with this person for the next five years? Do I trust them?"</p>

<p><strong>The Secret to Likability: Be Interested, Not Interesting</strong><br />
Being likable is not about trying to impress the other person with your wit, your wealth, or your accomplishments. The true secret to likability is being profoundly <em>interested</em>, rather than trying to be <em>interesting</em>.</p>

<p>This requires you to be fully, completely present in the interaction. It means asking deeply thoughtful questions and listening—really, truly listening—to the answers. You must notice the fine details of what the other person is saying and possess the emotional intelligence to go a layer deeper when appropriate. Do not just nod your head while waiting for your turn to speak; actively engage with their thoughts. Empathy and genuine curiosity go an incredibly long way in creating a lasting human connection.</p>

<p><strong>Creating Space Before Conversion</strong><br />
A fatal error in high-level networking is rushing the close. <strong>Do not try to close the deal or ask for the board seat in the very first meeting</strong>. You must make the interaction entirely about <em>them</em>. Create a safe, pressure-free space for authentic connection long before you ever attempt a business conversion. When you focus on building rapport and trust first, you lay an unshakeable foundation for a mutually beneficial, long-term relationship.</p>

<hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />

<h4>The Crucial Catalyst: Controlling the Follow-Up</h4>
<p>Even if you successfully move a contact through all four filters, the relationship will stagnate if you do not control the next step. A crucial bonus tip for securing high-level alliances is: <strong>Always get the contact</strong>.</p>

<p>It sounds remarkably simple, but it is absolutely critical. You must strive to walk away from the interaction with <em>their</em> contact information, rather than just handing them your card and hoping for the best. This single action puts the power of the follow-up entirely in your hands.</p>

<p>Far too many professionals rely on the standard, passive closing line: "Great meeting you—let's stay in touch". In the busy world of high-level executives, this almost always results in absolute silence. Instead, take the initiative and ask directly: <strong>"Would it be okay if I reached out to continue this conversation?"</strong>. Most people will readily agree to this polite, direct request. You now have an open door to walk through later, and a clear, sanctioned pathway to deepen the relationship.</p>

<p><strong>The Power of Consistency</strong><br />
Once you have the contact information, you must apply the final networking key: <em>Consistency</em>. Consistency is essential for building a reliable, resilient network. People often make the fatal mistake of reaching out only when they need something—like a job recommendation or a board seat nomination—which rapidly weakens relationships and breaks trust.</p>

<p>To secure your place in the inner circle, make a strict habit of staying in touch and nurturing these high-level connections consistently over time. Send a brief message to check in, congratulate them on a recent company milestone, or share a relevant industry article that aligns with the seed you planted in Filter 3. These small, consistent acts demonstrate your genuine interest and remind them that you value the relationship far beyond what they can do for you.</p>

<h4>Conclusion: Transforming Connections into Legacy</h4>
<p>Securing board seats, earning high-level alliances, and building unparalleled influence is both an art and a meticulous strategy. It requires showing up with extreme clarity and authenticity, offering immense value without the immediate expectation of return, and building unwavering consistency into how you show up for others.</p>

<p>By deliberately moving your connections through the Four Networking Filters—ensuring you have access to the right rooms, making yourself memorably visible, planting the seed of your expertise through storytelling, and prioritizing genuine empathy and likability—you move far beyond surface-level interactions. You create the exact conditions necessary for opportunity, deep trust, and long-term impact.</p>

<p>Relationships are the true currency of elite success. They unlock the doors to the boardrooms that hard work alone simply cannot open. Treat your network like your net worth: nurture it, invest in it deeply, and protect it with absolute integrity. By mastering these four filters, the right relationships will not just support your professional journey—they will fundamentally transform it.</p>`
      }
    ]
  }
};

let activePlaybookKey = '';
let activeFileIndex = null;
let originalDocContent = '';

async function loadPlaybookAnnotations() {
  const annotationsList = document.getElementById('pdf-annotations-list');
  const documentContainer = document.getElementById('pdf-rendered-document');
  if (!annotationsList || !documentContainer || !activePlaybookKey || activeFileIndex === null) return;

  let docHTML = originalDocContent;

  try {
    const qSnap = await getDocs(query(
      collection(db, "playbook_annotations"),
      where("userId", "==", currentUserUid),
      where("playbookKey", "==", activePlaybookKey),
      where("fileIndex", "==", activeFileIndex)
    ));

    // Sort documents client-side by createdAt to avoid composite index requirements
    const docs = [];
    qSnap.forEach(docSnap => {
      docs.push({ id: docSnap.id, ...docSnap.data() });
    });
    docs.sort((a, b) => {
      const timeA = a.createdAt ? (a.createdAt.toMillis ? a.createdAt.toMillis() : a.createdAt) : 0;
      const timeB = b.createdAt ? (b.createdAt.toMillis ? b.createdAt.toMillis() : b.createdAt) : 0;
      return timeA - timeB;
    });

    let html = '';

    docs.forEach(ann => {
      const annId = ann.id;
      const selectedText = ann.selectedText || '';
      const comment = ann.comment || '';

      // Highlight matching text in document body (case-insensitive replace)
      if (selectedText) {
        // Simple escape helper for regex matching
        const escaped = selectedText.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        try {
          const regex = new RegExp(`(${escaped})`, 'gi');
          docHTML = docHTML.replace(regex, `<mark class="pdf-text-highlight" data-id="${annId}" style="background: linear-gradient(104deg, rgba(254, 240, 138, 0.95) 0%, rgba(253, 224, 71, 0.85) 100%); color: #000 !important; cursor: pointer; padding: 2px 4px; border-radius: 3px; font-weight: bold; box-shadow: 1px 1px 3px rgba(0,0,0,0.1);">$1</mark>`);
        } catch(e) {
          // Fallback simple replace
          docHTML = docHTML.replaceAll(selectedText, `<mark class="pdf-text-highlight" data-id="${annId}" style="background: linear-gradient(104deg, rgba(254, 240, 138, 0.95) 0%, rgba(253, 224, 71, 0.85) 100%); color: #000 !important; cursor: pointer; padding: 2px 4px; border-radius: 3px; font-weight: bold; box-shadow: 1px 1px 3px rgba(0,0,0,0.1);">${selectedText}</mark>`);
        }
      }

      html += `
        <div style="background: #151515; border: 1px solid #333; border-radius: 6px; padding: 12px; font-size: 0.85rem; margin-bottom: 10px; box-sizing: border-box;">
          ${selectedText ? `
            <div style="border-left: 2px solid #c8a97e; padding-left: 8px; margin-bottom: 8px; color: #888; font-style: italic; font-size: 0.8rem; max-height: 4.2em; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;">
              "${escapeHTML(selectedText)}"
            </div>
          ` : ''}
          <div style="color: #fff; margin-bottom: 8px; line-height: 1.45; white-space: pre-wrap; font-family: inherit;">${escapeHTML(comment)}</div>
          <div style="display: flex; justify-content: flex-end;">
            <button class="delete-annotation-btn" data-id="${annId}" style="background: transparent; border: none; color: #ef4444; font-size: 0.75rem; cursor: pointer; padding: 2px 6px; font-weight: bold; transition: color 0.2s;" onmouseover="this.style.color='#dc2626'" onmouseout="this.style.color='#ef4444'">Delete</button>
          </div>
        </div>
      `;
    });

    documentContainer.innerHTML = docHTML;

    if (qSnap.size === 0) {
      annotationsList.innerHTML = `<p style="color: #666; font-size: 0.85rem; text-align: center; padding-top: 20px;">No notes added yet.</p>`;
    } else {
      annotationsList.innerHTML = html;

      // Delete Click Handlers
      annotationsList.querySelectorAll('.delete-annotation-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const annId = e.currentTarget.getAttribute('data-id');
          if (!confirm("Are you sure you want to delete this note?")) return;

          try {
            await deleteDoc(doc(db, "playbook_annotations", annId));
            loadPlaybookAnnotations();
          } catch (err) {
            console.error("Error deleting annotation:", err);
            alert("Failed to delete note. Try again.");
          }
        });
      });
    }

  } catch (err) {
    console.error("Error loading annotations:", err);
    annotationsList.innerHTML = `<p style="color: red; font-size: 0.85rem;">Error loading annotations.</p>`;
  }
}

function initPlaybookVault() {
  const vaultItems = document.querySelectorAll('.vault-playbook-item');
  const selectorModal = document.getElementById('pdf-selector-modal');
  const closeSelectorBtn = document.getElementById('close-pdf-selector-modal-btn');
  const filesListContainer = document.getElementById('pdf-files-list');
  const selectorTitle = document.getElementById('pdf-selector-title');

  const readerModal = document.getElementById('pdf-reader-modal');
  const closeReaderBtn = document.getElementById('close-pdf-reader-modal-btn');
  const readerTitle = document.getElementById('pdf-reader-title');
  const documentContainer = document.getElementById('pdf-rendered-document');

  // Annotation form controls
  const addAnnotationBtn = document.getElementById('add-annotation-btn');
  const formContainer = document.getElementById('add-annotation-form-container');
  const annotationForm = document.getElementById('add-annotation-form');
  const cancelAnnotationBtn = document.getElementById('cancel-annotation-btn');
  const inputSelectedText = document.getElementById('annotation-selected-text');
  const inputComment = document.getElementById('annotation-comment');

  if (!selectorModal || !closeSelectorBtn || !filesListContainer || !selectorTitle || !readerModal || !closeReaderBtn || !readerTitle || !documentContainer) return;

  vaultItems.forEach(item => {
    item.addEventListener('click', (e) => {
      const vaultKey = e.currentTarget.getAttribute('data-vault-key');
      const playbookData = playbookVault[vaultKey];
      if (!playbookData) return;

      selectorTitle.innerText = playbookData.title;
      filesListContainer.innerHTML = '';

      playbookData.files.forEach((file, idx) => {
        const fileRow = document.createElement('div');
        fileRow.style.cssText = 'padding:12px; background:#111; border:1px solid #222; border-radius:4px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; transition:all 0.2s;';
        fileRow.setAttribute('data-index', idx);
        
        fileRow.innerHTML = `
          <span style="color:#fff; font-weight:500; font-size:0.95rem;">${file.title}</span>
          <span style="color:#c8a97e; font-size:0.8rem; font-weight:bold; border:1px solid #c8a97e; padding:2px 8px; border-radius:4px; display:inline-flex; align-items:center; gap:4px;">
            👁 View
          </span>
        `;

        fileRow.addEventListener('mouseover', () => {
          fileRow.style.borderColor = '#c8a97e';
          fileRow.style.background = '#161616';
        });
        fileRow.addEventListener('mouseout', () => {
          fileRow.style.borderColor = '#222';
          fileRow.style.background = '#111';
        });

        // Click a document to view inside the custom PDF Viewer
        fileRow.addEventListener('click', () => {
          selectorModal.style.display = 'none'; // Close selector
          
          activePlaybookKey = vaultKey;
          activeFileIndex = idx;
          originalDocContent = file.content;

          readerTitle.innerText = file.title;
          
          if (formContainer) formContainer.style.display = 'none';
          if (annotationForm) annotationForm.reset();

          // Load original content and fetch annotations!
          documentContainer.innerHTML = originalDocContent;
          loadPlaybookAnnotations();
          
          readerModal.style.display = 'flex'; // Open viewer
        });

        filesListContainer.appendChild(fileRow);
      });

      selectorModal.style.display = 'flex';
    });
  });

  // Sidebar Annotation triggers
  if (addAnnotationBtn && formContainer) {
    addAnnotationBtn.addEventListener('click', () => {
      // Clear form
      annotationForm.reset();
      
      // Auto-prefill if the user has selected any text in the document
      let selText = '';
      if (window.getSelection) {
        selText = window.getSelection().toString().trim();
      } else if (document.selection && document.selection.type !== "Control") {
        selText = document.selection.createRange().text.trim();
      }

      if (inputSelectedText) {
        inputSelectedText.value = selText;
      }

      formContainer.style.display = 'block';
      if (inputComment) inputComment.focus();
    });
  }

  if (cancelAnnotationBtn && formContainer) {
    cancelAnnotationBtn.addEventListener('click', () => {
      formContainer.style.display = 'none';
      annotationForm.reset();
    });
  }

  if (annotationForm) {
    annotationForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const selectedText = inputSelectedText.value.trim();
      const comment = inputComment.value.trim();

      const submitBtn = annotationForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Saving...';
      }

      try {
        await addDoc(collection(db, "playbook_annotations"), {
          userId: currentUserUid,
          playbookKey: activePlaybookKey,
          fileIndex: activeFileIndex,
          selectedText: selectedText,
          comment: comment,
          createdAt: serverTimestamp()
        });

        formContainer.style.display = 'none';
        annotationForm.reset();

        // Refresh view with new annotations and highlights
        loadPlaybookAnnotations();

      } catch (err) {
        console.error("Error creating annotation:", err);
        alert("Failed to save annotation. Try again.");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerText = 'Save';
        }
      }
    });
  }

  closeSelectorBtn.addEventListener('click', () => {
    selectorModal.style.display = 'none';
  });

  closeReaderBtn.addEventListener('click', () => {
    readerModal.style.display = 'none';
    activePlaybookKey = '';
    activeFileIndex = null;
    originalDocContent = '';
  });
}

// --- EVENTS MANAGEMENT SYSTEM --- //

// Fallback event configuration if Firestore events are empty
const fallbackEvent = {
  id: "default-la-sports-event",
  title: "The Golden Era of LA Sports!",
  date: "Tuesday, August 4, 2026 • 11:00 AM - 1:00 PM",
  location: "The LAB Inc., 15916 Crenshaw Blvd, Gardena, CA 90249",
  overview: "Leveraging the Olympics, Super Bowl, World Cup, and more into Lasting Economic and Social Impact. SOCIETY LA: Leveraging Sports Moments into Lasting Momentum",
  cohosts: "Profluence & Playing For Keeps Foundation",
  ticketPrice: "Free",
  imageUrl: "https://www.eventbrite.com/e/_next/image?url=https%3A%2F%2Fimg.evbuc.com%2Fhttps%253A%252F%252Fcdn.evbuc.com%252Fimages%252F1188637605%252F636362833813%252F1%252Foriginal.20260710-202211%3Fcrop%3Dfocalpoint%26fit%3Dcrop%26w%3D1880%26auto%3Dformat%252Ccompress%26q%3D75%26sharp%3D10%26fp-x%3D0.5%26fp-y%3D0.5%26s%3D41ef85234ac8bc4a05be6d9eaf8a4f07&w=1880&q=75",
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

function initEventsManagement() {
  const form = document.getElementById('admin-event-form');
  const cancelBtn = document.getElementById('admin-event-cancel-btn');
  
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const eventId = document.getElementById('admin-event-id').value;
      const title = document.getElementById('admin-event-title').value.trim();
      const date = document.getElementById('admin-event-date').value.trim();
      const locationVal = document.getElementById('admin-event-location').value.trim();
      const cohosts = document.getElementById('admin-event-cohosts').value.trim();
      const price = document.getElementById('admin-event-price').value.trim() || 'Free';
      const imageUrl = document.getElementById('admin-event-image').value.trim();
      const overview = document.getElementById('admin-event-overview').value.trim();
      const description = document.getElementById('admin-event-description').value.trim();
      
      const submitBtn = document.getElementById('admin-event-submit-btn');
      const statusSpan = document.getElementById('admin-event-status');
      
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'SAVING...';
      }
      
      try {
        const eventData = {
          title,
          date,
          location: locationVal,
          cohosts,
          ticketPrice: price,
          imageUrl,
          overview,
          description,
          createdAt: serverTimestamp()
        };
        
        if (eventId) {
          // Update event
          const eventRef = doc(db, "events", eventId);
          await setDoc(eventRef, eventData, { merge: true });
        } else {
          // Add event
          await addDoc(collection(db, "events"), eventData);
        }
        
        if (statusSpan) {
          statusSpan.textContent = 'Event saved successfully!';
          statusSpan.style.display = 'inline';
          setTimeout(() => { statusSpan.style.display = 'none'; }, 4000);
        }
        
        form.reset();
        document.getElementById('admin-event-id').value = '';
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (submitBtn) submitBtn.textContent = 'Save Event';
        
        loadAdminEvents();
        loadHubEvents();
        
      } catch (err) {
        console.error("Error saving event", err);
        alert("Error saving event.");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
        }
      }
    });
  }
  
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      if (form) form.reset();
      document.getElementById('admin-event-id').value = '';
      cancelBtn.style.display = 'none';
      const submitBtn = document.getElementById('admin-event-submit-btn');
      if (submitBtn) submitBtn.textContent = 'Save Event';
    });
  }
}

// Load events list for members hub view
async function loadHubEvents() {
  const container = document.getElementById('hub-events-list');
  if (!container) return;
  
  container.innerHTML = '<p style="color: #888;">Loading events...</p>';
  
  let events = [];
  try {
    const q = query(collection(db, "events"), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
      events.push({ id: doc.id, ...doc.data() });
    });
  } catch (err) {
    console.error("Error loading hub events", err);
  }
  
  if (events.length === 0) {
    // Show fallback event
    events = [fallbackEvent];
  }
  
  container.innerHTML = '';
  
  events.forEach(ev => {
    const card = document.createElement('div');
    card.className = 'membership-card';
    card.style.background = '#111';
    card.style.border = '1px solid #333';
    card.style.padding = '25px';
    card.style.borderRadius = '8px';
    card.style.display = 'grid';
    card.style.gridTemplateColumns = ev.imageUrl ? '150px 1fr' : '1fr';
    card.style.gap = '25px';
    
    // Parse descriptions (newlines/headings/bullets)
    const formattedDesc = ev.description ? ev.description
      .replace(/\n/g, '<br>')
      .replace(/### (.*?)(<br>|$)/g, '<h4 style="color:#c8a97e; margin-top:15px; margin-bottom:5px;">$1</h4>')
      .replace(/- (.*?)(<br>|$)/g, '<li style="margin-left:15px; color:#aaa;">$1</li>')
      : '';
      
    const imagePart = ev.imageUrl ? `<div style="background-image: url('${ev.imageUrl}'); background-size:cover; background-position:center; border-radius:4px; min-height:150px;"></div>` : '';
    
    const cohostsText = ev.cohosts ? `<div style="font-size:0.85rem; color:#888; margin-top:5px;">Co-Hosted By: ${ev.cohosts}</div>` : '';
    
    card.innerHTML = `
      ${imagePart}
      <div style="display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <span style="font-size:0.75rem; background:rgba(200, 169, 126, 0.1); color:#c8a97e; padding:3px 8px; border-radius:4px; font-weight:bold; letter-spacing:1px; border:1px solid rgba(200, 169, 126, 0.2);">SOCIETY EVENT</span>
            <span style="font-size:0.75rem; color:#10b981; font-weight:bold;">${ev.ticketPrice || 'Free'}</span>
          </div>
          <h3 style="color:#fff; font-family:var(--font-serif); font-size:1.6rem; margin-top:0; margin-bottom:10px;">${ev.title}</h3>
          <div style="font-size:0.9rem; color:#888; display:flex; flex-direction:column; gap:4px; margin-bottom:15px;">
            <div>🕒 ${ev.date}</div>
            <div>📍 ${ev.location}</div>
            ${cohostsText}
          </div>
          <p style="color:#eee; line-height:1.6; margin-bottom:15px;">${ev.overview}</p>
          
          <button class="event-details-toggle" data-id="hub-${ev.id}" style="background:transparent; border:none; color:#c8a97e; font-weight:600; cursor:pointer; padding:0; display:inline-flex; align-items:center; gap:5px; font-size:0.9rem; transition:all 0.3s;">
            <span>View Full Details & Schedule</span> <span class="arrow-hub-${ev.id}">▼</span>
          </button>
          
          <div id="details-hub-${ev.id}" style="display:none; margin-top:15px; padding-top:15px; border-top:1px solid #333; font-size:0.9rem; color:#ccc; line-height:1.6;">
            ${formattedDesc}
          </div>
        </div>
        
        <div style="margin-top:20px; display:flex; gap:15px;">
          <a href="events.html" target="_blank" class="btn" style="background:#c8a97e; color:black; font-weight:bold; padding:10px 20px; border-radius:4px; border:none; text-align:center; font-size:0.9rem; text-decoration:none; cursor:pointer;">RSVP / Get Ticket</a>
        </div>
      </div>
    `;
    
    container.appendChild(card);
    
    // Toggle expand/collapse listener
    const toggleBtn = card.querySelector('.event-details-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const detailsDiv = document.getElementById(`details-hub-${ev.id}`);
        const arrow = card.querySelector(`.arrow-hub-${ev.id}`);
        if (detailsDiv.style.display === 'block') {
          detailsDiv.style.display = 'none';
          arrow.textContent = '▼';
        } else {
          detailsDiv.style.display = 'block';
          arrow.textContent = '▲';
        }
      });
    }
  });
}

// Load events list for admin panel
async function loadAdminEvents() {
  const tbody = document.getElementById('admin-events-tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '<tr><td colspan="4" style="padding:15px; text-align:center; color:#888;">Loading events...</td></tr>';
  
  let events = [];
  try {
    const q = query(collection(db, "events"), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
      events.push({ id: doc.id, ...doc.data() });
    });
  } catch (err) {
    console.error("Error loading admin events", err);
  }
  
  // SEED CHECK: If events collection is empty and user is logged in, seed the default event!
  if (events.length === 0 && isAdmin) {
    try {
      const defaultEvent = {
        title: fallbackEvent.title,
        date: fallbackEvent.date,
        location: fallbackEvent.location,
        overview: fallbackEvent.overview,
        cohosts: fallbackEvent.cohosts,
        ticketPrice: fallbackEvent.ticketPrice,
        imageUrl: fallbackEvent.imageUrl,
        description: fallbackEvent.description,
        createdAt: serverTimestamp()
      };
      await addDoc(collection(db, "events"), defaultEvent);
      // Reload immediately
      setTimeout(loadAdminEvents, 500);
      return;
    } catch (seedErr) {
      console.error("Database seeding failed", seedErr);
    }
  }
  
  if (events.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="padding:15px; text-align:center; color:#888;">No events found in database.</td></tr>';
    return;
  }
  
  tbody.innerHTML = '';
  
  events.forEach(ev => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid #222';
    
    tr.innerHTML = `
      <td style="padding:15px; color:#eee;">${ev.date}</td>
      <td style="padding:15px; color:#fff; font-weight:bold;">${ev.title}</td>
      <td style="padding:15px; color:#aaa;">${ev.location}</td>
      <td style="padding:15px;">
        <button class="admin-edit-event-btn" data-id="${ev.id}" style="background:#c8a97e; color:black; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-weight:bold; margin-right:8px;">Edit</button>
        <button class="admin-delete-event-btn" data-id="${ev.id}" style="background:#ef4444; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-weight:bold;">Delete</button>
      </td>
    `;
    
    tbody.appendChild(tr);
    
    // Wire up edit button click
    tr.querySelector('.admin-edit-event-btn').addEventListener('click', () => {
      document.getElementById('admin-event-id').value = ev.id;
      document.getElementById('admin-event-title').value = ev.title || '';
      document.getElementById('admin-event-date').value = ev.date || '';
      document.getElementById('admin-event-location').value = ev.location || '';
      document.getElementById('admin-event-cohosts').value = ev.cohosts || '';
      document.getElementById('admin-event-price').value = ev.ticketPrice || 'Free';
      document.getElementById('admin-event-image').value = ev.imageUrl || '';
      document.getElementById('admin-event-overview').value = ev.overview || '';
      document.getElementById('admin-event-description').value = ev.description || '';
      
      const cancelBtn = document.getElementById('admin-event-cancel-btn');
      if (cancelBtn) cancelBtn.style.display = 'inline-block';
      const submitBtn = document.getElementById('admin-event-submit-btn');
      if (submitBtn) submitBtn.textContent = 'Update Event';
      
      document.getElementById('admin-event-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    
    // Wire up delete button click
    tr.querySelector('.admin-delete-event-btn').addEventListener('click', async () => {
      if (confirm(`Are you sure you want to permanently delete the event "${ev.title}"?`)) {
        try {
          await deleteDoc(doc(db, "events", ev.id));
          loadAdminEvents();
          loadHubEvents();
        } catch (deleteErr) {
          console.error("Error deleting event", deleteErr);
          alert("Error deleting event.");
        }
      }
    });
  });
}

window.loadAdminEvents = loadAdminEvents;
window.loadHubEvents = loadHubEvents;

// Run initialization
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initLearningTracks();
    initIntelligenceCenter();
    initManualInvite();
    initOpportunities();
    initPromptLibrary();
    initPlaybookVault();
    initEventsManagement();
  });
} else {
  initLearningTracks();
  initIntelligenceCenter();
  initManualInvite();
  initOpportunities();
  initPromptLibrary();
  initPlaybookVault();
  initEventsManagement();
}
