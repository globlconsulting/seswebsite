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

      const formData = new FormData(membershipForm);
      const email = (formData.get('email') || '').trim();
      const phone = (formData.get('phone') || '').trim();
      const fullName = (formData.get('fullName') || '').trim();
      const firstName = fullName.split(' ')[0] || '';
      const company = (formData.get('company') || '').trim();
      const title = (formData.get('title') || '').trim();
      const referrer = (formData.get('referrer') || '').trim();
      const tier = formData.get('tier') || 'general';
      const billingInput = membershipForm.querySelector('input[name="billing"]:checked');
      const billing = billingInput && tier !== 'general' ? billingInput.value : 'monthly';
      
      const textarea = membershipForm.querySelector('textarea');
      const experience = textarea ? textarea.value.trim() : '';

      const clienteleInput = membershipForm.querySelector('input[name="clientele"]:checked');
      const clientele = clienteleInput ? clienteleInput.parentNode.textContent.trim() : 'Not Selected';

      if (!validateEmail(email)) {
        showNotification('Please enter a valid email address.', 'error', memNotification);
        return;
      }

      // Collect selected industries
      const industries = [];
      membershipForm.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
        // Exclude the newsletter checkbox from industries
        if (cb.id !== 'mem-newsletter') {
          industries.push(cb.parentNode.textContent.trim());
        }
      });

      const submitBtn = membershipForm.querySelector('button[type="submit"]');
      const originalBtnText = submitBtn ? submitBtn.textContent : 'Submit Application';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'SUBMITTING...';
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

        const websiteUrl = membershipForm.querySelector('input[name="website_url"]')?.value || '';
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
          referrer: referrer,
          tier: tier,
          billing: billing,
          industries: industries,
          clientele: clientele,
          experience: experience,
          headshotUrl: headshotUrl,
          subscribeNewsletter: subscribeNewsletter,
          website_url: websiteUrl
        };

        const response = await fetch('/api/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error('Failed to submit application.');
        }

        // Show Success notification
        showNotification(`Thank you, ${firstName}! Your application for membership has been submitted securely and is pending review.`, 'success', memNotification);
        membershipForm.reset();

      } catch (err) {
        console.error("Application submission failed:", err);
        showNotification('An error occurred. Please try again later or contact support.', 'error', memNotification);
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
