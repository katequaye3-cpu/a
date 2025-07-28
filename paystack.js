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

async function verifyPayment(reference) {
  showPopup('load', 'Verifying payment…');

  const secretKey = 'sk_test_65b426e3ed57bad58395a500bf68f17cf50e3df4';
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

    // ── REMOVE OLD CLONES ─────────────────────────────
    document.querySelectorAll('.clone').forEach(el => el.remove());

    // ── EXTRACT DATA ────────────────────────────────────
    const data   = json.data;
    const paidAt = new Date(data.paidAt);

    // map custom_fields by variable_name
    const cf = data.metadata.custom_fields.reduce((acc, f) => {
      acc[f.variable_name] = f.value;
      return acc;
    }, {});

    // names & phone
    const primaryName = `${cf.first_name} ${cf.last_name}`;
    const partnerName = cf.partner_first_name
      ? `${cf.partner_first_name} ${cf.partner_last_name}`
      : '';
    const phone = cf.phone_number || data.customer.phone;

    // ticket ID
    const payref   = data.reference.toString().slice(6);
    const ticketID = `BM - ${(parseFloat(data.id) + Number(payref)).toString().slice(-6)}`;

    // ── RENDER MAIN TICKET ──────────────────────────────
    codePara.textContent      = ticketID;
    nameOnTicket.textContent  = primaryName;
    buyerEmail.textContent    = data.customer.email;
    buyerNumber.textContent   = formatGhanaPhone(phone);
    purchaseInfo.textContent  = `Purchased at ${paidAt.toLocaleString()}`;
    setTicketTypeStyle(data.amount);
    displayPaymentDetails(data, paidAt, primaryName, partnerName);

    // ── ENCRYPT & STORE PRIMARY ────────────────────────
    const info      = {
      key: ticketID,
      name: primaryName,
      number: phone,
      email: data.customer.email
    };
    const encrypted = CryptoJS.AES
      .encrypt(JSON.stringify(info), 'Made_By_BM')
      .toString();
    lastEncryptedCode = encrypted;

    const dbPath = `${primaryName}'s ticket ID ${ticketID.slice(-6)}`;
    await checkAndAddToDatabase(dbPath, { code: info }).catch(() => {});

    // ── GENERATE QR ON MAIN ─────────────────────────────
    generateQR(encrypted);

    // ── DOUBLE TICKET FOR COUPLE PRICES ─────────────────
    const paidAmount = data.amount / 100;  // kobo → cedi
    if (paidAmount === 180 || paidAmount === 380) {
      // ── ENCRYPT & STORE PARTNER ──────────────────────
      const partnerInfo = {
        key: ticketID,
        name: partnerName,
        number: phone,
        email: data.customer.email
      };
      const encryptedPartner = CryptoJS.AES
        .encrypt(JSON.stringify(partnerInfo), 'Made_By_BM')
        .toString();

      const partnerDbPath = `${partnerName}'s ticket ID ${ticketID.slice(-6)}`;
      await checkAndAddToDatabase(partnerDbPath, { code: partnerInfo }).catch(() => {});

      // clone the ticket DOM
      const second = ticketBox.cloneNode(true);
      second.classList.add('clone');
      ticketBox.parentNode.appendChild(second);

      // swap in partner’s name
      second.querySelector('#name').textContent = partnerName;

      // redraw partner’s QR
      const cloneQR = second.querySelector('.qr');
      cloneQR.innerHTML = '';
      new QRCode(cloneQR, {
        width: 170,
        height: 170,
        colorDark: 'black',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      }).makeCode(encryptedPartner);
    }

  } catch (err) {
    console.error(err);
    showPopup('error', 'Network or server error');
  }
}


  // ── PAYMENT INFO RENDERER ─────────────────────────────────
  function displayPaymentDetails(data, dateObj, primaryName, partnerName) {
    let holders = `<p>Ticket Holder(S): ${primaryName}`;
    if (partnerName) holders += `, ${partnerName}`;
    holders += `</p>`;

    paymentInfoEl.innerHTML = `
      ${holders}
      <p>Customer Email: ${data.customer.email}</p>
      <p>Payment Amount: ₵${(data.amount/100).toFixed(2)}</p>
      <p>Payment Number: ${data.customer.phone}</p>
      <p>Payment Reference: ${data.reference}</p>
      <p>Payment ID: ${data.id}</p>
      <p>Payment Time: ${dateObj.toString()}</p>
    `;
  }

  // ── UTILS ──────────────────────────────────────────────────
  function formatGhanaPhone(raw) {
    const cleaned = raw.replace(/\D/g, '');
    return `+233 ${cleaned.slice(1,4)} ${cleaned.slice(4,7)} ${cleaned.slice(7,10)}`;
  }

  function setTicketTypeStyle(amountInKobo) {
    const price = (amountInKobo / 100).toFixed(2);
    const tLabel = document.getElementById('tictype');

    if (+price === 200 || +price === 380) {
      tLabel.textContent = 'V.I.P';
      document.getElementById('style').href = 'style.css';
      ticketBox.style.backgroundImage = 'url("Layer 2.png")';
    } else {
      tLabel.textContent = 'REGULAR';
      document.getElementById('style').href = 'regular.css';
      ticketBox.style.backgroundImage = 'url("Prism Overlays 7 copy.png")';
    }
  }

  function generateQR(payload) {
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
  async function checkAndAddToDatabase(key, data) {
    showPopup('load', 'Checking database…');
    const usedRef   = ref(db, `Used/${key}`);
    const unusedRef = ref(db, `Unused/${key}`);

    try {
      const usedSnap   = await get(usedRef);
      if (usedSnap.exists()) {
        showPopup('success', 'Ticket already marked used');
        return usedSnap.val();
      }
      const unusedSnap = await get(unusedRef);
      if (unusedSnap.exists()) {
        showPopup('success', 'Ticket already generated');
        return unusedSnap.val();
      }
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
    wrapper.style.background     = styles.background;
    wrapper.style.padding        = '30px';
    wrapper.style.display        = 'flex';
    wrapper.style.justifyContent = 'center';
    wrapper.style.alignItems     = 'center';
    wrapper.style.position       = 'absolute';
    wrapper.style.top            = '-9999px';
    wrapper.style.left           = '-9999px';

    const clone = element.cloneNode(true);
    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);
    return wrapper;
  }

  function downloadAsPNG() {
    showPopup('load', 'Preparing download…');
    const wrapper = createSnapshotWrapper(ticketBox);
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
      const link    = document.createElement('a');
      link.href     = canvas.toDataURL('image/png');
      link.download = 'ticket.png';
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
      const imgData   = canvas.toDataURL('image/png');
      const { jsPDF } = window.jspdf;
      const pdf       = new jsPDF({
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
