// ── GLOBAL VARS ─────────────────────────────────────────────
let lastEncryptedCode = '';   // store QR payload for redrawing on clones

// ── POPUP SETUP ─────────────────────────────────────────────
const popup        = document.getElementById('popup');
const popupIcon    = document.getElementById('popup-icon');
const popupMessage = document.getElementById('popup-message');

function showPopup(state, message) {
  popupIcon.className       = `popup-icon ${state}`;
  popupMessage.textContent  = message;
  popup.style.display       = 'flex';
  popup.style.flexDirection = 'column';

  if (state !== 'load') {
    setTimeout(() => { popup.style.display = 'none'; }, 2000);
  }
}

// ── ELEMENT REFERENCES ──────────────────────────────────────
const nameOnTicket    = document.getElementById('name');
const buyerEmail      = document.getElementById('email');
const buyerNumber     = document.getElementById('number');
const codePara        = document.getElementById('code');
const ticketBox       = document.getElementById('ticketBox');
const purchaseInfo    = document.getElementById('purch');
const paymentInfoEl   = document.getElementById('payment-info');
const qrContainer     = document.createElement('div');
qrContainer.className = 'qr';
document.getElementById('qrcode').appendChild(qrContainer);

const generateBtn     = document.getElementById('generate-ticket');
const downloadPngBtn  = document.getElementById('download-ticket');
const downloadPdfBtn  = document.getElementById('download-pdf');

// ── PAYMENT VERIFICATION & TICKET CREATION ─────────────────
async function verifyPayment(reference) {
  showPopup('load', 'Verifying payment…');

  const secretKey = 'pk_test_b471ee2b1372d9a277e09b93d0cb1e52db3dfba9';
  const url       = `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`;

  try {
    const res  = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${secretKey}` }
    });
    const json = await res.json();

    if (!json.status) {
      showPopup('error', 'Verification failed');
      return;
    }

    showPopup('success', 'Payment verified');
    const data       = json.data;
    const paidAt     = new Date(data.paidAt);
    const fullName   = `${data.metadata.custom_fields[0].value} ${data.metadata.custom_fields[1].value}`;
    const phone      = data.metadata.custom_fields[2].value;
    const payref     = data.reference.toString().slice(6);
    const ticketID   = `BM - ${(parseFloat(data.id) + Number(payref)).toString().slice(-6)}`;
    const info       = {
      key:    ticketID,
      name:   fullName,
      number: phone,
      email:  data.customer.email
    };

    // display code & UI
    codePara.textContent      = ticketID;
    nameOnTicket.textContent  = info.name;
    buyerEmail.textContent    = info.email;
    buyerNumber.textContent   = formatGhanaPhone(info.number);
    purchaseInfo.textContent  = `Purchased at ${paidAt.toLocaleString()}`;
    setTicketTypeStyle(data.amount);
    displayPaymentDetails(data, paidAt);

    // encrypt & store ticket
    const secret    = 'Made_By_BM';
    const encrypted = CryptoJS.AES.encrypt(JSON.stringify(info), secret).toString();
    const dbPath    = `${info.name}'s ticket ID ${ticketID.slice(-6)}`;
    checkAndAddToDatabase(dbPath, { code: info })
  .then(existingOrNew => {
    console.log('DB record:', existingOrNew);
  })
  .catch(err => { /* handle error if needed */ });


    // generate QR with encrypted payload
    generateQR(encrypted);

  } catch (err) {
    console.error(err);
    showPopup('error', 'Network or server error');
  }
}

// format Ghana phone as +233 XXX XXX XXX
function formatGhanaPhone(raw) {
  const cleaned = raw.replace(/\D/g, '');
  return `+233 ${cleaned.slice(1,4)} ${cleaned.slice(4,7)} ${cleaned.slice(7,10)}`;
}

// set ticket background & label based on amount
function setTicketTypeStyle(amountInKobo) {
  const price = (amountInKobo / 100).toFixed(2);
  const tLabel = document.getElementById('tictype');

  if (+price === 200) {
    tLabel.textContent = 'V.I.P';
    document.getElementById('style').href = 'style.css';
    ticketBox.style.backgroundImage = 'url("Layer 2.png")';
  } else {
    tLabel.textContent = 'REGULAR';
    document.getElementById('style').href = 'regular.css';
    ticketBox.style.backgroundImage = 'url("Prism Overlays 7 copy.png")';
  }
}

// fill in detailed payment info section
function displayPaymentDetails(data, dateObj) {
  paymentInfoEl.innerHTML = `
    <p>Customer Name: ${data.customer.first_name} ${data.customer.last_name}</p>
    <p>Customer Email: ${data.customer.email}</p>
    <p>Payment Amount: ₵${(data.amount / 100).toFixed(2)}</p>
    <p>Payment Number: ${data.customer.phone}</p>
    <p>Payment Reference: ${data.reference}</p>
    <p>Payment ID: ${data.id}</p>
    <p>Payment Time: ${dateObj.toString()}</p>
  `;
}

// generate QR code into qrContainer
function generateQR(payload) {
  lastEncryptedCode = payload;     // ← remember for download
  qrContainer.innerHTML = '';

  new QRCode(qrContainer, {
    width: 170,
    height: 170,
    colorDark: 'black',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H
  }).makeCode(payload);
}

// ── DATABASE HELPERS ───────────────────────────────────────
/**
 * Checks both 'Used' and 'Unused' for a ticket key.
 * If found, returns the existing record.
 * Otherwise writes under 'Unused' and returns the new data.
 */
async function checkAndAddToDatabase(key, data) {
  showPopup('load', 'Checking database…');

  const usedRef   = ref(db, `Used/${key}`);
  const unusedRef = ref(db, `Unused/${key}`);

  try {
    // 1) Look for a Used ticket
    const usedSnap = await get(usedRef);
    if (usedSnap.exists()) {
      showPopup('success', 'Ticket already marked used');
      return usedSnap.val();
    }

    // 2) Look for an Unused ticket
    const unusedSnap = await get(unusedRef);
    if (unusedSnap.exists()) {
      showPopup('success', 'Ticket already generated');
      return unusedSnap.val();
    }

    // 3) Not in either—write under Unused
    await set(unusedRef, data);
    showPopup('success', 'Ticket saved');
    return data;

  } catch (err) {
    console.error(err);
    showPopup('error', 'DB operation failed');
    throw err;
  }
}

// ── DOWNLOAD HELPERS ───────────────────────────────────────
function createSnapshotWrapper(element) {
  const wrapper = document.createElement('div');
  const styles  = getComputedStyle(document.body);
  wrapper.style.background       = styles.background;
  wrapper.style.padding          = '30px';
  wrapper.style.display          = 'flex';
  wrapper.style.justifyContent   = 'center';
  wrapper.style.alignItems       = 'center';
  wrapper.style.position         = 'absolute';
  wrapper.style.top              = '-9999px';
  wrapper.style.left             = '-9999px';

  const clone = element.cloneNode(true);
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);
  return wrapper;
}

function downloadAsPNG() {
  showPopup('load', 'Preparing download…');
  const wrapper = createSnapshotWrapper(ticketBox);

  // redraw QR onto the clone
  const cloneQR = wrapper.querySelector('.qr');
  if (cloneQR && lastEncryptedCode) {
    cloneQR.innerHTML = '';
    new QRCode(cloneQR, {
      width: 170,
      height: 170,
      colorDark: 'black',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    }).makeCode(lastEncryptedCode);
  }

  html2canvas(wrapper, { scale: 2 }).then(canvas => {
    const link      = document.createElement('a');
    link.href       = canvas.toDataURL('image/png');
    link.download   = 'ticket.png';
    link.click();
    document.body.removeChild(wrapper);
    showPopup('success', 'Downloaded!');
  }).catch(err => {
    console.error(err);
    showPopup('error', 'Download failed');
  });
}

function downloadAsPDF() {
  showPopup('load', 'Preparing download…');
  const wrapper = createSnapshotWrapper(ticketBox);

  // redraw QR onto the clone
  const cloneQR = wrapper.querySelector('.qr');
  if (cloneQR && lastEncryptedCode) {
    cloneQR.innerHTML = '';
    new QRCode(cloneQR, {
      width: 170,
      height: 170,
      colorDark: 'black',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    }).makeCode(lastEncryptedCode);
  }

  html2canvas(wrapper, { scale: 2 }).then(canvas => {
    const imgData      = canvas.toDataURL('image/png');
    const { jsPDF }    = window.jspdf;
    const pdf          = new jsPDF({
      orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
      unit: 'px',
      format: [canvas.width, canvas.height]
    });
    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
    pdf.save('ticket.pdf');
    document.body.removeChild(wrapper);
    showPopup('success', 'Downloaded!');
  }).catch(err => {
    console.error(err);
    showPopup('error', 'Download failed');
  });
}

// ── EVENT LISTENERS ────────────────────────────────────────
generateBtn.addEventListener('click', () => {
  const refVal = document.getElementById('ref').value.trim();
  if (!refVal) {
    showPopup('error', 'Please enter reference');
    return;
  }
  verifyPayment(refVal);
});

downloadPngBtn.addEventListener('click', downloadAsPNG);
downloadPdfBtn.addEventListener('click', downloadAsPDF);
