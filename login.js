import { auth, db, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, RecaptchaVerifier, signInWithPhoneNumber } from './firebase.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// DOM Elements
const msg = document.getElementById('message');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');

// Modes
let mode = 'login'; // 'login', 'register', 'reset'

// --- EMAIL & PASSWORD AUTHENTICATION --- //

// 1. Log In Existing User
document.getElementById('btn-login').addEventListener('click', () => {
  const email = emailInput.value;
  const password = passwordInput.value;
  signInWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
      msg.style.color = "green";
      msg.innerText = `Logged in successfully as ${userCredential.user.email}!`;
      window.location.replace('hub.html');
    })
    .catch((error) => {
      msg.style.color = "red";
      msg.innerText = `Error: ${error.message}`;
    });
});

// 2. Register New User
document.getElementById('btn-register').addEventListener('click', async () => {
  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;

  if (!email || !password) {
    msg.style.color = "red";
    msg.innerText = "Please fill in both email and password fields.";
    return;
  }

  const btnRegister = document.getElementById('btn-register');
  btnRegister.disabled = true;
  btnRegister.innerText = "Registering...";

  try {
    // Check if the email exists in approved_emails
    const approvedDocRef = doc(db, "approved_emails", email);
    const approvedDocSnap = await getDoc(approvedDocRef);

    if (!approvedDocSnap.exists()) {
      msg.style.color = "red";
      msg.innerText = "Error: This email has not been approved for registration yet. Please submit a membership application first.";
      btnRegister.disabled = false;
      btnRegister.innerText = "Register";
      return;
    }

    createUserWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        msg.style.color = "green";
        msg.innerText = `Account created for ${userCredential.user.email}!`;
        window.location.replace('hub.html');
      })
      .catch((error) => {
        msg.style.color = "red";
        msg.innerText = `Error: ${error.message}`;
        btnRegister.disabled = false;
        btnRegister.innerText = "Register";
      });
  } catch (error) {
    console.error("Firestore approved_emails lookup failed:", error);
    msg.style.color = "red";
    msg.innerText = `Error checking email status: ${error.message}`;
    btnRegister.disabled = false;
    btnRegister.innerText = "Register";
  }
});

// 3. Forgot Password / Send Reset Email
document.getElementById('btn-reset').addEventListener('click', async () => {
  const email = emailInput.value.trim().toLowerCase();
  if(!email) {
    msg.style.color = "red";
    msg.innerText = "Please enter your email to reset password.";
    return;
  }

  const btnReset = document.getElementById('btn-reset');
  btnReset.disabled = true;
  btnReset.innerText = "Verifying...";

  try {
    // Enforce check: must exist in approved_emails AND have registered: true
    const approvedDocRef = doc(db, "approved_emails", email);
    const approvedDocSnap = await getDoc(approvedDocRef);

    if (!approvedDocSnap.exists() || approvedDocSnap.data().registered !== true) {
      msg.style.color = "red";
      msg.innerText = "Error: This email address is not registered in our system.";
      btnReset.disabled = false;
      btnReset.innerText = "Send Reset Link";
      return;
    }

    sendPasswordResetEmail(auth, email)
      .then(() => {
        msg.style.color = "green";
        msg.innerText = `Password reset email sent to ${email}. Check your spam or promotions folder if you do not see it.`;
      })
      .catch((error) => {
        msg.style.color = "red";
        msg.innerText = `Error: ${error.message}`;
      })
      .finally(() => {
        btnReset.disabled = false;
        btnReset.innerText = "Send Reset Link";
      });

  } catch (err) {
    console.error("Error verifying registration status:", err);
    msg.style.color = "red";
    msg.innerText = `Error checking email: ${err.message}`;
    btnReset.disabled = false;
    btnReset.innerText = "Send Reset Link";
  }
});

// --- SMS OTP (PHONE AUTHENTICATION) --- //

// To use Phone Auth, Firebase requires a Recaptcha to prevent spam.
let confirmationResult = null; // Will store the SMS code session

// Initialize Recaptcha (this renders an invisible or visible captcha)
function initRecaptcha() {
  if(!window.recaptchaVerifier) {
    window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
      'size': 'invisible', // Can be 'normal' if you want a visible checkbox
      'callback': (response) => {
        // reCAPTCHA solved
      }
    });
  }
}

// 4. Send the SMS Code
document.getElementById('btn-send-code').addEventListener('click', () => {
  let rawPhone = document.getElementById('phone-number').value;
  
  // Format to E.164 (Assuming US numbers for now: strip everything, add +1)
  let cleanPhone = rawPhone.replace(/\D/g, ''); 
  if (cleanPhone.length === 10) {
    cleanPhone = '+1' + cleanPhone;
  } else if (cleanPhone.length === 11 && cleanPhone.startsWith('1')) {
    cleanPhone = '+' + cleanPhone;
  } else {
    // If it already has a plus or is international, just make sure it has a plus
    if(!rawPhone.startsWith('+')) {
       cleanPhone = '+' + cleanPhone;
    } else {
       cleanPhone = '+' + cleanPhone; // Fallback
    }
  }

  initRecaptcha();
  const appVerifier = window.recaptchaVerifier;

  signInWithPhoneNumber(auth, cleanPhone, appVerifier)
    .then((result) => {
      // SMS sent. Show the code input field.
      confirmationResult = result;
      document.getElementById('phone-input-group').classList.add('hidden');
      document.getElementById('code-input-group').classList.remove('hidden');
      msg.style.color = "green";
      msg.innerText = "SMS Code sent!";
    }).catch((error) => {
      msg.style.color = "red";
      msg.innerText = `Error sending SMS: ${error.message}`;
    });
});

// 5. Verify the SMS Code
document.getElementById('btn-verify-code').addEventListener('click', () => {
  const code = document.getElementById('verification-code').value;
  confirmationResult.confirm(code).then((result) => {
    // User signed in successfully.
    const user = result.user;
    msg.style.color = "green";
    msg.innerText = `Logged in via phone! UID: ${user.uid}`;
    window.location.replace('hub.html');
  }).catch((error) => {
    msg.style.color = "red";
    msg.innerText = `Invalid code: ${error.message}`;
  });
});


// --- UI Toggle Logic (Just for switching forms in this demo) --- //
const emailForm = document.getElementById('email-form-container');
const phoneForm = document.getElementById('phone-form-container');
const title = document.getElementById('form-title');

function switchToRegister() {
  document.getElementById('btn-login').style.display = 'none';
  document.getElementById('btn-register').style.display = 'block';
  document.getElementById('btn-reset').style.display = 'none';
  
  const passwordGroup = passwordInput.closest('.form-group');
  if (passwordGroup) {
    passwordGroup.style.display = 'block';
    const label = passwordGroup.querySelector('label');
    if (label) label.innerText = "Create Password";
  }
  passwordInput.placeholder = "Create a password";
  title.innerText = "Society Hub Registration";
  msg.innerText = "";
}

function switchToLogin() {
  document.getElementById('btn-login').style.display = 'block';
  document.getElementById('btn-register').style.display = 'none';
  document.getElementById('btn-reset').style.display = 'none';
  
  const passwordGroup = passwordInput.closest('.form-group');
  if (passwordGroup) {
    passwordGroup.style.display = 'block';
    const label = passwordGroup.querySelector('label');
    if (label) label.innerText = "Password";
  }
  passwordInput.placeholder = "Password";
  title.innerText = "Society Hub Login";
  msg.innerText = "";
}

// Auto-switch to register mode if URL has ?register=true
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('register') === 'true') {
  switchToRegister();
  const emailParam = urlParams.get('email');
  if (emailParam) {
    emailInput.value = emailParam;
  }
}

const toggleRegisterEl = document.getElementById('toggle-register');
if (toggleRegisterEl) {
  toggleRegisterEl.addEventListener('click', () => {
    switchToRegister();
  });
}

document.getElementById('toggle-reset').addEventListener('click', () => {
  document.getElementById('btn-login').style.display = 'none';
  document.getElementById('btn-register').style.display = 'none';
  document.getElementById('btn-reset').style.display = 'block';
  const passwordGroup = passwordInput.closest('.form-group');
  if (passwordGroup) passwordGroup.style.display = 'none';
  title.innerText = "Reset Password";
  msg.innerText = "";
});

document.getElementById('toggle-phone').addEventListener('click', () => {
  emailForm.classList.add('hidden');
  phoneForm.classList.remove('hidden');
  title.innerText = "Login via SMS";
  msg.innerText = "";
});

document.getElementById('toggle-email').addEventListener('click', () => {
  phoneForm.classList.add('hidden');
  emailForm.classList.remove('hidden');
  switchToLogin();
});

// Password visibility toggle handler
const passwordToggle = document.getElementById('toggle-password-visibility');
if (passwordToggle) {
  passwordToggle.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    passwordToggle.innerText = isPassword ? '🙈' : '👁️';
  });
}
