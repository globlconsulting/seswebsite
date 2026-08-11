document.addEventListener('DOMContentLoaded', () => {
  const csepForm = document.getElementById('csep-application');
  const csepNotification = document.getElementById('form-notification');

  if (csepForm) {
    csepForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (csepNotification) csepNotification.style.display = 'none';

      const firstName = document.getElementById('first-name').value.trim();
      const lastName = document.getElementById('last-name').value.trim();
      const email = document.getElementById('email').value.trim();
      const industrySelect = document.getElementById('industry');
      const industryValue = industrySelect.value;
      const industryText = industrySelect.options[industrySelect.selectedIndex].text;
      const experienceSelect = document.getElementById('experience');
      const experienceValue = experienceSelect.value;
      const experienceText = experienceSelect.options[experienceSelect.selectedIndex].text;
      const experienceDetail = document.getElementById('experience-detail').value.trim();
      const consent = document.getElementById('consent').checked;

      if (!firstName || !lastName || !email || !industryValue || !experienceValue || !consent) {
        showNotification('Please fill in all required fields and consent to the rules.', 'error', csepNotification);
        return;
      }
      if (!validateEmail(email)) {
        showNotification('Please enter a valid email address.', 'error', csepNotification);
        return;
      }

      const submitBtn = csepForm.querySelector('button[type="submit"]');
      const originalBtnText = submitBtn ? submitBtn.textContent : 'SUBMIT CSEP APPLICATION';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'SUBMITTING...';
      }

      try {
        const websiteUrl = csepForm.querySelector('input[name="website_url"]')?.value || '';
        const newsletterCheckbox = document.getElementById('csep-newsletter');
        const subscribeNewsletter = !!(newsletterCheckbox && newsletterCheckbox.checked);

        // 1. Submit to the secure /api/apply serverless function
        const payload = {
          type: 'csep',
          firstName,
          lastName,
          email,
          industryValue,
          industryText,
          experienceValue,
          experienceText,
          experienceDetail,
          subscribeNewsletter,
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

        const successMsg = `Congratulations, ${firstName}! Your application for the CSEP designation has been submitted successfully. A Sellebrity Council member will contact you within 48 hours.`;
        showNotification(successMsg, 'success', csepNotification);
        csepForm.reset();

      } catch (err) {
        console.error("Application submission failed:", err);
        showNotification('An error occurred. Please try again later or contact support.', 'error', csepNotification);
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
