document.getElementById('rcaForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorContainer = document.getElementById('errorContainer');
    errorContainer.classList.add('hidden');
    errorContainer.innerHTML = '';

    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    // Validare
    const errors = [];

    // Validare An
    const currentYear = new Date().getFullYear();
    const carYear = parseInt(data.year);
    if (isNaN(carYear) || carYear > currentYear || carYear < 1900) {
        errors.push(`Anul de fabricație (${data.year}) este invalid. Trebuie să fie între 1900 și ${currentYear}.`);
    }

    // Validare CNP (13 cifre + algoritm de control de baza)
    if (!validareCNP(data.taxId)) {
        errors.push(`CNP-ul introdus (${data.taxId}) nu este valid.`);
    }

    if (parseInt(data.engineDisplacement) <= 0 || parseInt(data.enginePower) <= 0) {
        errors.push(`Capacitatea cilindrică și puterea motorului trebuie să fie mai mari de 0.`);
    }

    if (errors.length > 0) {
        errorContainer.innerHTML = errors.join('<br>');
        errorContainer.classList.remove('hidden');
        return;
    }

    document.getElementById('rcaForm').classList.add('hidden');
    document.getElementById('loadingState').classList.remove('hidden');
    document.getElementById('resultsArea').classList.add('hidden');

    // Populeaza Datele in Rezumat
    document.getElementById('summaryDriver').textContent = `${data.lastName} ${data.firstName}`;
    document.getElementById('summaryCnp').textContent = data.taxId;
    document.getElementById('summaryCar').textContent = `${data.brand} ${data.model} (${data.year}) - ${data.licensePlate}`;
    document.getElementById('summaryVin').textContent = data.vin;

    try {

        const response = await fetch('/api/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success && result.offers.length > 0) {
            renderOffers(result.offers);
        } else {
            alert('Nu s-au găsit oferte pentru aceste date. Verifică log-urile din server.');
            resetForm();
        }
    } catch (error) {
        console.error('Error:', error);
        alert('A apărut o eroare la conexiunea cu serverul.');
        resetForm();
    }
});

function renderOffers(offers) {
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('resultsArea').classList.remove('hidden');
    document.getElementById('offersCount').textContent = `${offers.length} Oferte`;

    const offersList = document.getElementById('offersList');
    offersList.innerHTML = '';


    offers.sort((a, b) => a.premiumAmount - b.premiumAmount);

    offers.forEach(offer => {
        const card = document.createElement('div');
        card.className = 'offer-card';
        
        card.innerHTML = `
            <div class="offer-provider">${offer.provider.replace('_', ' ')}</div>
            <div class="offer-price">${offer.premiumAmount} <span>${offer.currency}</span></div>
            <button class="btn-buy" onclick="buyOffer('${offer.offerId}')">
                <i data-lucide="shopping-cart" style="display:inline-block; vertical-align:middle; width:18px; margin-right:5px"></i> Cumpără
            </button>
        `;
        offersList.appendChild(card);
    });


    lucide.createIcons();
}

function resetForm() {
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('rcaForm').classList.remove('hidden');
}

let currentPdfBlobUrl = null;

async function buyOffer(offerId) {
    const buyButtons = document.querySelectorAll('.btn-buy');
    buyButtons.forEach(b => {
        b.disabled = true;
        b.innerHTML = '<span style="display:inline-block;">Se generează PDF...</span>';
    });

    try {
        const response = await fetch('/api/buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ offerId })
        });

        const result = await response.json();

        if (result.success && result.pdfBase64) {
            // Elibereaza blob URL-ul anterior
            if (currentPdfBlobUrl) {
                URL.revokeObjectURL(currentPdfBlobUrl);
            }

            // Convert Base64 to Blob
            const byteCharacters = atob(result.pdfBase64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const pdfBlob = new Blob([byteArray], { type: 'application/pdf' });
            currentPdfBlobUrl = URL.createObjectURL(pdfBlob);

            let finalFileName = `Polita_RCA_${offerId}.pdf`;

            // Populeaza butonul de vizualizare (deschide in tab nou)
            const viewPdfBtn = document.getElementById('viewPdfBtn');
            viewPdfBtn.href = `/api/pdf/${offerId}`;

            // Populeaza butonul de download direct de pe server
            const downloadBtn = document.getElementById('downloadPdfBtn');
            downloadBtn.href = `/api/pdf/${offerId}?download=1`;
            downloadBtn.setAttribute('download', finalFileName);
            downloadBtn.onclick = null;

            // Afiseaza previzualizarea inline in iframe
            const pdfPreviewFrame = document.getElementById('pdfPreviewFrame');
            if (pdfPreviewFrame) {
                pdfPreviewFrame.src = `/api/pdf/${offerId}`;
            }

            // Badge ID oferta
            const modalOfferBadge = document.getElementById('modalOfferBadge');
            if (modalOfferBadge) {
                modalOfferBadge.textContent = `#${offerId}`;
            }

            // Deschide modalul
            document.getElementById('successModal').classList.remove('hidden');
            lucide.createIcons();
        } else if (result.success) {
            alert('Poliță emisă, dar documentul PDF nu a fost returnat de asigurator.');
        } else {
            alert('Eroare: ' + (result.message || 'Nu s-a putut genera polița.'));
        }
    } catch (error) {
        console.error('Error:', error);
        alert('A apărut o eroare la procesarea comenzii: ' + error.message);
    } finally {
        buyButtons.forEach(b => {
            b.disabled = false;
            b.innerHTML = '<i data-lucide="shopping-cart" style="display:inline-block; vertical-align:middle; width:18px; margin-right:5px"></i> Cumpără';
        });
        lucide.createIcons();
    }
}

function closeModal() {
    document.getElementById('successModal').classList.add('hidden');
    const pdfPreviewFrame = document.getElementById('pdfPreviewFrame');
    if (pdfPreviewFrame) {
        pdfPreviewFrame.src = '';
    }
}

document.getElementById('closeModalBtn').addEventListener('click', closeModal);
const closeModalCrossBtn = document.getElementById('closeModalCrossBtn');
if (closeModalCrossBtn) {
    closeModalCrossBtn.addEventListener('click', closeModal);
}

document.getElementById('successModal').addEventListener('click', (e) => {
    if (e.target.id === 'successModal') {
        closeModal();
    }
});

document.getElementById('backToFormBtn').addEventListener('click', () => {
    document.getElementById('resultsArea').classList.add('hidden');
    document.getElementById('errorContainer').classList.add('hidden');
    document.getElementById('rcaForm').classList.remove('hidden');
});

document.getElementById('goHomeBtn').addEventListener('click', () => {
    // Reset complete form and return to start
    document.getElementById('rcaForm').reset();
    document.getElementById('resultsArea').classList.add('hidden');
    document.getElementById('errorContainer').classList.add('hidden');
    document.getElementById('rcaForm').classList.remove('hidden');
});

// Functie de validare CNP romanesc
function validareCNP(cnp) {
    if (typeof cnp !== 'string' || cnp.length !== 13 || isNaN(cnp)) return false;
    return true;
}

// Generator de date aleatorii valide pentru testare
const RANDOM_DRIVERS = [
    { firstName: 'Ion', lastName: 'Popescu', gender: 'M', birthYear: 1985, birthMonth: 4, birthDay: 12, licenseYear: 2005 },
    { firstName: 'Maria', lastName: 'Ionescu', gender: 'F', birthYear: 1992, birthMonth: 8, birthDay: 23, licenseYear: 2012 },
    { firstName: 'Andrei', lastName: 'Radu', gender: 'M', birthYear: 1988, birthMonth: 11, birthDay: 5, licenseYear: 2008 },
    { firstName: 'Elena', lastName: 'Dumitru', gender: 'F', birthYear: 1995, birthMonth: 2, birthDay: 18, licenseYear: 2015 },
    { firstName: 'Alexandru', lastName: 'Stan', gender: 'M', birthYear: 1982, birthMonth: 6, birthDay: 30, licenseYear: 2002 },
    { firstName: 'Gabriel', lastName: 'Stoica', gender: 'M', birthYear: 1990, birthMonth: 10, birthDay: 14, licenseYear: 2010 },
    { firstName: 'Cristian', lastName: 'Marin', gender: 'M', birthYear: 1987, birthMonth: 3, birthDay: 9, licenseYear: 2007 },
    { firstName: 'Ana', lastName: 'Tudor', gender: 'F', birthYear: 1994, birthMonth: 7, birthDay: 27, licenseYear: 2014 },
    { firstName: 'Mihai', lastName: 'Dobre', gender: 'M', birthYear: 1980, birthMonth: 12, birthDay: 3, licenseYear: 2000 },
    { firstName: 'Vasile', lastName: 'Pop', gender: 'M', birthYear: 1991, birthMonth: 7, birthDay: 16, licenseYear: 2015 }
];

const RANDOM_CARS = [
    { brand: 'Volkswagen', model: 'Golf', year: 2020, firstReg: '2020-05-15', engineDisplacement: 1598, enginePower: 85, fuelType: 'diesel', vehicleType: 'M1', seats: 5, totalWeight: 1750, mileage: 150000, vinPrefix: 'WVWZZZ3CZWE' },
    { brand: 'Dacia', model: 'Duster', year: 2021, firstReg: '2021-03-20', engineDisplacement: 1461, enginePower: 84, fuelType: 'diesel', vehicleType: 'M1', seats: 5, totalWeight: 1820, mileage: 75000, vinPrefix: 'VF1HSD40647' },
    { brand: 'Skoda', model: 'Octavia', year: 2019, firstReg: '2019-09-10', engineDisplacement: 1968, enginePower: 110, fuelType: 'diesel', vehicleType: 'M1', seats: 5, totalWeight: 1890, mileage: 185000, vinPrefix: 'TMBJJ7NE0K0' },
    { brand: 'BMW', model: 'Seria 3', year: 2018, firstReg: '2018-04-12', engineDisplacement: 1995, enginePower: 140, fuelType: 'diesel', vehicleType: 'M1', seats: 5, totalWeight: 1980, mileage: 192000, vinPrefix: 'WBA8E11080K' },
    { brand: 'Renault', model: 'Megane', year: 2022, firstReg: '2022-06-18', engineDisplacement: 1332, enginePower: 103, fuelType: 'gasoline', vehicleType: 'M1', seats: 5, totalWeight: 1650, mileage: 42000, vinPrefix: 'VF1RFB00867' },
    { brand: 'Toyota', model: 'Corolla', year: 2021, firstReg: '2021-11-05', engineDisplacement: 1798, enginePower: 90, fuelType: 'hybrid', vehicleType: 'M1', seats: 5, totalWeight: 1720, mileage: 58000, vinPrefix: 'SB1ZE3BE30E' },
    { brand: 'Ford', model: 'Focus', year: 2020, firstReg: '2020-08-22', engineDisplacement: 999, enginePower: 92, fuelType: 'gasoline', vehicleType: 'M1', seats: 5, totalWeight: 1680, mileage: 88000, vinPrefix: 'WF0NXXGCHN1' },
    { brand: 'Hyundai', model: 'Tucson', year: 2022, firstReg: '2022-01-15', engineDisplacement: 1598, enginePower: 110, fuelType: 'hybrid', vehicleType: 'M1', seats: 5, totalWeight: 1950, mileage: 48000, vinPrefix: 'TMAH3812AMJ' }
];

const RANDOM_LOCATIONS = [
    { county: 'CJ', countyNumericCode: 12, city: 'Cluj-Napoca', postcode: '400356', streets: ['Str. Memorandumului', 'Calea Motilor', 'Str. Horea', 'Str. Republicii', 'Str. Principala', 'B-dul 21 Decembrie 1989'], ciPrefix: 'CJ' },
    { county: 'B', countyNumericCode: 40, city: 'Bucuresti', postcode: '010061', streets: ['Calea Victoriei', 'B-dul Unirii', 'Str. Aviatorilor', 'Sos. Stefan cel Mare', 'B-dul Magheru', 'Str. Lipscani'], ciPrefix: 'RX' },
    { county: 'TM', countyNumericCode: 35, city: 'Timisoara', postcode: '300054', streets: ['B-dul Revolutiei', 'Str. Circumvalatiunii', 'Calea Aradului', 'Str. Gheorghe Lazar'], ciPrefix: 'TM' },
    { county: 'IS', countyNumericCode: 22, city: 'Iasi', postcode: '700028', streets: ['B-dul Stefan cel Mare', 'Str. Pacurari', 'Str. Sararie', 'B-dul Independentei'], ciPrefix: 'IS' },
    { county: 'BV', countyNumericCode: 8, city: 'Brasov', postcode: '500030', streets: ['Str. Republicii', 'Calea Bucuresti', 'Str. Muresenilor', 'Str. Lunga'], ciPrefix: 'BV' },
    { county: 'CT', countyNumericCode: 13, city: 'Constanta', postcode: '900647', streets: ['B-dul Tomis', 'B-dul Mamaia', 'Str. Mircea cel Batran', 'Str. Traian'], ciPrefix: 'CT' },
    { county: 'SB', countyNumericCode: 32, city: 'Sibiu', postcode: '550178', streets: ['Str. Nicolae Balcescu', 'Calea Dumbravii', 'Str. Mitropoliei', 'Sos. Alba Iulia'], ciPrefix: 'SB' }
];

function generateValidCNP(gender, birthYear, birthMonth, birthDay, countyNumericCode) {
    const s = (birthYear >= 2000) ? (gender === 'M' ? 5 : 6) : (gender === 'M' ? 1 : 2);
    const aa = String(birthYear % 100).padStart(2, '0');
    const ll = String(birthMonth).padStart(2, '0');
    const zz = String(birthDay).padStart(2, '0');
    const jj = String(countyNumericCode).padStart(2, '0');
    const nnn = String(Math.floor(Math.random() * 899) + 100).padStart(3, '0');
    const first12 = `${s}${aa}${ll}${zz}${jj}${nnn}`;
    const weights = [2, 7, 9, 1, 4, 6, 3, 5, 8, 2, 7, 9];
    let sum = 0;
    for (let i = 0; i < 12; i++) {
        sum += parseInt(first12[i]) * weights[i];
    }
    const remainder = sum % 11;
    const c = (remainder === 10) ? 1 : remainder;
    return `${first12}${c}`;
}

function getRandomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateRandomLicensePlate(county) {
    const chars = 'ABCDEFGHJKLMNPRSTUVWXYZ';
    const num = county === 'B' ? getRandomInt(100, 999) : getRandomInt(10, 99);
    const letters = chars[getRandomInt(0, chars.length - 1)] +
                    chars[getRandomInt(0, chars.length - 1)] +
                    chars[getRandomInt(0, chars.length - 1)];
    return `${county}${num}${letters}`;
}

function generateRandomVIN(prefix) {
    const chars = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
    let suffix = '';
    const needed = 17 - prefix.length;
    for (let i = 0; i < needed; i++) {
        suffix += chars[getRandomInt(0, chars.length - 1)];
    }
    return `${prefix}${suffix}`;
}

// Auto Fill / Random Data Generator
const autoFillBtn = document.getElementById('autoFillBtn');
if (autoFillBtn) {
    autoFillBtn.addEventListener('click', () => {
        const driver = getRandomItem(RANDOM_DRIVERS);
        const car = getRandomItem(RANDOM_CARS);
        const location = getRandomItem(RANDOM_LOCATIONS);

        // Date Sofer
        const cnp = generateValidCNP(driver.gender, driver.birthYear, driver.birthMonth, driver.birthDay, location.countyNumericCode);
        const ciNumber = `${location.ciPrefix}${getRandomInt(100000, 999999)}`;
        const licenseMonth = String(getRandomInt(1, 12)).padStart(2, '0');
        const licenseDay = String(getRandomInt(1, 28)).padStart(2, '0');

        document.getElementById('lastName').value = driver.lastName;
        document.getElementById('firstName').value = driver.firstName;
        document.getElementById('taxId').value = cnp;
        document.getElementById('idNumber').value = ciNumber;
        document.getElementById('licenseIssueDate').value = `${driver.licenseYear}-${licenseMonth}-${licenseDay}`;

        // Date Masina
        const plate = generateRandomLicensePlate(location.county);
        const vin = generateRandomVIN(car.vinPrefix);
        const mileageVariance = getRandomInt(-15000, 25000);
        const finalMileage = Math.max(10000, car.mileage + mileageVariance);

        document.getElementById('brand').value = car.brand;
        document.getElementById('model').value = car.model;
        document.getElementById('licensePlate').value = plate;
        document.getElementById('vin').value = vin;
        document.getElementById('year').value = car.year;
        document.getElementById('firstRegistration').value = car.firstReg;
        document.getElementById('engineDisplacement').value = car.engineDisplacement;
        document.getElementById('enginePower').value = car.enginePower;
        document.getElementById('fuelType').value = car.fuelType;
        document.getElementById('vehicleType').value = car.vehicleType;
        document.getElementById('seats').value = car.seats;
        document.getElementById('totalWeight').value = car.totalWeight;
        document.getElementById('currentMileage').value = finalMileage;

        // Date Adresa
        const street = getRandomItem(location.streets);
        const houseNumber = String(getRandomInt(1, 150));

        document.getElementById('county').value = location.county;
        document.getElementById('city').value = location.city;
        document.getElementById('street').value = street;
        document.getElementById('houseNumber').value = houseNumber;
        document.getElementById('postcode').value = location.postcode;

        // Data Inceput Polita
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + getRandomInt(1, 5));
        const yyyy = tomorrow.getFullYear();
        const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
        const dd = String(tomorrow.getDate()).padStart(2, '0');
        document.getElementById('startDate').value = `${yyyy}-${mm}-${dd}`;

        // Feedback vizual pe buton
        autoFillBtn.style.transform = 'scale(0.96)';
        setTimeout(() => {
            autoFillBtn.style.transform = 'scale(1)';
        }, 150);
    });
}
