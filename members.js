import { storage } from './firebase.js';
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

document.addEventListener('DOMContentLoaded', () => {
  const membershipForm = document.getElementById('membership-application');
  if (membershipForm) {
    // Auto-select tier from URL query parameters
    const urlParams = new URLSearchParams(window.location.search);
    const tierParam = urlParams.get('tier');
    if (tierParam) {
      const targetRadio = membershipForm.querySelector(`input[name="tier"][value="${tierParam}"]`);
      if (targetRadio) {
        targetRadio.checked = true;
      }
    }

    // Dynamic Billing Plan logic
    const billingGroup = document.getElementById('billing-frequency-group');
    const monthlyLabel = document.getElementById('billing-monthly-label');
    const yearlyLabel = document.getElementById('billing-yearly-label');
    const yearlyContainer = document.getElementById('billing-yearly-container');

    function updateBillingOptions() {
      const selectedTierInput = membershipForm.querySelector('input[name="tier"]:checked');
      if (!selectedTierInput) return;
      const tier = selectedTierInput.value;

      if (tier === 'general') {
        billingGroup.style.display = 'none';
      } else {
        billingGroup.style.display = 'block';
        
        if (tier === 'vendor') {
          monthlyLabel.innerText = 'Monthly ($497 / month)';
          yearlyContainer.style.display = 'none';
          // Ensure monthly is checked
          const monthlyRadio = membershipForm.querySelector('input[name="billing"][value="monthly"]');
          if (monthlyRadio) monthlyRadio.checked = true;
        } else {
          yearlyContainer.style.display = 'inline-flex';
          
          if (tier === 'sellebrity') {
            monthlyLabel.innerText = 'Monthly ($47 / month)';
            yearlyLabel.innerText = 'Yearly ($497 / year — Save 12%)';
          } else if (tier === 'guild') {
            monthlyLabel.innerText = 'Monthly ($97 / month)';
            yearlyLabel.innerText = 'Yearly ($997 / year — Save 15%)';
          } else if (tier === 'council') {
            monthlyLabel.innerText = 'Monthly ($97 / month — 1st Year Free!)';
            yearlyLabel.innerText = 'Yearly ($997 / year — 1st Year Free!)';
          }
        }
      }
    }

    // Attach listeners to tier changes
    membershipForm.querySelectorAll('input[name="tier"]').forEach(radio => {
      radio.addEventListener('change', updateBillingOptions);
    });

    // Run once on load
    updateBillingOptions();

  // --- NDA Modal & Signature Logic --- //
  const ndaModal = document.getElementById('nda-modal');
  const btnOpenNdaModal = document.getElementById('btn-open-nda-modal');
  const btnCloseNdaModal = document.getElementById('btn-close-nda-modal');
  const btnCancelNdaModal = document.getElementById('btn-cancel-nda-modal');
  const btnAcceptNdaModal = document.getElementById('btn-accept-nda-modal');

  const ndaModalName = document.getElementById('nda-modal-name');
  const ndaModalDate = document.getElementById('nda-modal-date');
  const ndaModalSignature = document.getElementById('nda-modal-signature');
  const ndaModalConsent = document.getElementById('nda-modal-consent');

  const ndaAgreementCheckbox = document.getElementById('nda-agreement-checkbox');
  const ndaSignerNameHidden = document.getElementById('nda-signer-name');
  const ndaSignedDateHidden = document.getElementById('nda-signed-date');
  const ndaSignedAtHidden = document.getElementById('nda-signed-at');

  const ndaStatusIcon = document.getElementById('nda-status-icon');
  const ndaStatusTitle = document.getElementById('nda-status-title');
  const ndaStatusSubtitle = document.getElementById('nda-status-subtitle');

  function getFormattedToday() {
    return new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  function openNdaModal() {
    if (!ndaModal) return;
    const fullNameInput = membershipForm.querySelector('input[name="fullName"]');
    const existingName = fullNameInput ? fullNameInput.value.trim() : '';
    
    if (ndaModalName && (!ndaModalName.value || !ndaAgreementCheckbox?.checked)) {
      ndaModalName.value = existingName;
    }
    if (ndaModalDate) {
      ndaModalDate.value = getFormattedToday();
    }
    if (ndaModalSignature && (!ndaAgreementCheckbox || !ndaAgreementCheckbox.checked) && existingName) {
      ndaModalSignature.value = existingName;
    }
    ndaModal.style.display = 'flex';
  }

  function closeNdaModal() {
    if (ndaModal) ndaModal.style.display = 'none';
  }

  if (btnOpenNdaModal) btnOpenNdaModal.addEventListener('click', openNdaModal);
  if (btnCloseNdaModal) btnCloseNdaModal.addEventListener('click', closeNdaModal);
  if (btnCancelNdaModal) btnCancelNdaModal.addEventListener('click', closeNdaModal);

  window.addEventListener('click', (e) => {
    if (e.target === ndaModal) {
      closeNdaModal();
    }
  });

  if (btnAcceptNdaModal) {
    btnAcceptNdaModal.addEventListener('click', () => {
      const signerName = (ndaModalName?.value || '').trim();
      const signature = (ndaModalSignature?.value || '').trim();
      const isConsented = !!ndaModalConsent?.checked;

      if (!signerName) {
        alert('Please enter your full legal printed name.');
        ndaModalName?.focus();
        return;
      }
      if (!signature) {
        alert('Please type your digital signature.');
        ndaModalSignature?.focus();
        return;
      }
      if (!isConsented) {
        alert('Please check the confirmation box to agree to the terms.');
        ndaModalConsent?.focus();
        return;
      }

      const dateStr = ndaModalDate?.value || getFormattedToday();
      const timestampIso = new Date().toISOString();

      // Update hidden form inputs
      if (ndaAgreementCheckbox) ndaAgreementCheckbox.checked = true;
      if (ndaSignerNameHidden) ndaSignerNameHidden.value = signerName;
      if (ndaSignedDateHidden) ndaSignedDateHidden.value = dateStr;
      if (ndaSignedAtHidden) ndaSignedAtHidden.value = timestampIso;

      // Update form UI
      if (ndaStatusIcon) {
        ndaStatusIcon.innerText = '✅';
        ndaStatusIcon.style.color = '#4ade80';
      }
      if (ndaStatusTitle) {
        ndaStatusTitle.innerText = 'Signed & Agreed';
        ndaStatusTitle.style.color = '#4ade80';
      }
      if (ndaStatusSubtitle) {
        ndaStatusSubtitle.innerText = `Digitally signed by ${signerName} on ${dateStr}`;
        ndaStatusSubtitle.style.color = '#ccc';
      }
      if (btnOpenNdaModal) {
        btnOpenNdaModal.innerText = 'Review Signed NDA';
        btnOpenNdaModal.style.background = 'rgba(200, 169, 126, 0.15)';
        btnOpenNdaModal.style.border = '1px solid #c8a97e';
        btnOpenNdaModal.style.color = '#c8a97e';
      }

      closeNdaModal();
    });
  }

  // Create a notification element for the membership form if it doesn't exist
  let memNotification = document.getElementById('mem-form-notification');
  if (!memNotification) {
    memNotification = document.createElement('div');
    memNotification.id = 'mem-form-notification';
    memNotification.className = 'form-notification';
    memNotification.style.display = 'none';
    membershipForm.parentNode.insertBefore(memNotification, membershipForm);
  }

  membershipForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    memNotification.style.display = 'none';

    // Verify NDA is signed
    if (!ndaAgreementCheckbox || !ndaAgreementCheckbox.checked) {
      showNotification('Please review and digitally sign the SES Non-Disclosure Agreement before submitting your application.', 'error', memNotification);
      document.getElementById('nda-status-box')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const formData = new FormData(membershipForm);
    const email = (formData.get('email') || '').trim();
    const phone = (formData.get('phone') || '').trim();
    const fullName = (formData.get('fullName') || '').trim();
    const firstName = fullName.split(' ')[0] || '';
    const company = (formData.get('company') || '').trim();
    const title = (formData.get('title') || '').trim();
    const website = (formData.get('website') || '').trim();
    const referrer = (formData.get('referrer') || '').trim();
    const heardAbout = (formData.get('heard_about') || '').trim();
    const tier = formData.get('tier') || 'general';
    const billingInput = membershipForm.querySelector('input[name="billing"]:checked');
    const billing = billingInput && tier !== 'general' ? billingInput.value : 'monthly';
    
    const experience = (formData.get('experience') || '').trim();
    const clientele = formData.get('clientele') || 'Both';
    const yearsServicing = formData.get('years_servicing') || '';
    const clientsServed = formData.get('clients_served') || '';
    const education = (formData.get('education') || '').trim();
    const athlete = formData.get('athlete') || 'No';
    const serviceAreas = (formData.get('service_areas') || '').trim();
    const mediaLinks = (formData.get('media_links') || '').trim();
    const bio = (formData.get('bio') || '').trim();
    const csep = formData.get('csep') || 'No';
    const references = (formData.get('references') || '').trim();
    const ndaBiz = formData.get('nda_biz') || 'In progress';
    const referral = formData.get('referral') || 'Yes';
    const statement = (formData.get('statement') || '').trim();
    const favTeam = (formData.get('fav_team') || '').trim();
    const favMovie = (formData.get('fav_movie') || '').trim();

    if (!validateEmail(email)) {
      showNotification('Please enter a valid email address.', 'error', memNotification);
      return;
    }

    // Collect selected industries
    const industries = [];
    membershipForm.querySelectorAll('input[name="industries"]:checked').forEach(cb => {
      industries.push(cb.value);
    });

    const submitBtn = document.getElementById('btn-submit-application') || membershipForm.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn ? submitBtn.textContent : 'Submit Application';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'SUBMITTING APPLICATION...';
    }

    try {
      // 1. Upload Headshot Image to Firebase Storage if selected
      let headshotUrl = '';
      const headshotInput = document.getElementById('headshot-upload');
      if (headshotInput && headshotInput.files && headshotInput.files[0]) {
        const file = headshotInput.files[0];
        const storageRef = ref(storage, `headshots/${Date.now()}_${file.name}`);
        if (submitBtn) {
          submitBtn.textContent = 'UPLOADING PHOTO...';
        }
        const uploadSnapshot = await uploadBytes(storageRef, file);
        headshotUrl = await getDownloadURL(uploadSnapshot.ref);
      }

      const websiteUrlHoneypot = membershipForm.querySelector('input[name="website_url"]')?.value || '';
      const newsletterCheckbox = document.getElementById('mem-newsletter');
      const subscribeNewsletter = !!(newsletterCheckbox && newsletterCheckbox.checked);

      // 2. Save application doc via secure backend /api/apply
      const payload = {
        type: 'membership',
        email: email.toLowerCase(),
        phone: phone,
        fullName: fullName,
        company: company,
        title: title,
        website: website,
        referrer: referrer,
        heardAbout: heardAbout,
        tier: tier,
        billing: billing,
        industries: industries,
        clientele: clientele,
        experience: experience || statement || bio,
        yearsServicing: yearsServicing,
        clientsServed: clientsServed,
        education: education,
        athlete: athlete,
        serviceAreas: serviceAreas,
        mediaLinks: mediaLinks,
        bio: bio,
        csep: csep,
        references: references,
        ndaBiz: ndaBiz,
        referral: referral,
        statement: statement,
        favTeam: favTeam,
        favMovie: favMovie,
        headshotUrl: headshotUrl,
        subscribeNewsletter: subscribeNewsletter,
        website_url: websiteUrlHoneypot,
        // Signed NDA details
        ndaSigned: true,
        ndaSignerName: ndaSignerNameHidden?.value || fullName,
        ndaSignedDate: ndaSignedDateHidden?.value || getFormattedToday(),
        ndaSignedAt: ndaSignedAtHidden?.value || new Date().toISOString(),
        ndaVersion: '1.0'
      };

      const response = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errData = await response.text();
        throw new Error(errData || 'Failed to submit application.');
      }

      // Show Success notification
      showNotification(`Thank you, ${firstName}! Your application for membership and signed Non-Disclosure Agreement have been submitted securely and are pending review.`, 'success', memNotification);
      membershipForm.reset();
      
      // Reset NDA status box
      if (ndaAgreementCheckbox) ndaAgreementCheckbox.checked = false;
      if (ndaSignerNameHidden) ndaSignerNameHidden.value = '';
      if (ndaSignedDateHidden) ndaSignedDateHidden.value = '';
      if (ndaSignedAtHidden) ndaSignedAtHidden.value = '';
      if (ndaStatusIcon) {
        ndaStatusIcon.innerText = '⚠️';
        ndaStatusIcon.style.color = '#f59e0b';
      }
      if (ndaStatusTitle) {
        ndaStatusTitle.innerText = 'Signature Required';
        ndaStatusTitle.style.color = '#f59e0b';
      }
      if (ndaStatusSubtitle) {
        ndaStatusSubtitle.innerText = 'Click the button to review and digitally sign the agreement.';
        ndaStatusSubtitle.style.color = 'var(--text-muted)';
      }
      if (btnOpenNdaModal) {
        btnOpenNdaModal.innerText = 'Review & Sign NDA →';
        btnOpenNdaModal.style.background = '#c8a97e';
        btnOpenNdaModal.style.border = 'none';
        btnOpenNdaModal.style.color = '#050811';
      }

    } catch (err) {
      console.error("Application submission failed:", err);
      showNotification(`An error occurred: ${err.message || 'Please try again later or contact support.'}`, 'error', memNotification);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
      }
    }
  });
  }

  function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  function showNotification(message, type, notificationEl) {
    if (notificationEl) {
      notificationEl.textContent = message;
      notificationEl.className = 'form-notification';
      notificationEl.classList.add(type);
      notificationEl.style.display = 'block';
      notificationEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      alert(message);
    }
  }
});
