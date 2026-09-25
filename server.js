require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { logAction } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

let cachedToken = null;


async function getAuthToken() {
    if (cachedToken) return cachedToken;
    try {
        const response = await axios.post(`${process.env.API_BASE_URL}/auth`, {
            account: process.env.API_ACCOUNT,
            password: process.env.API_PASSWORD
        });
        if (!response.data.error && response.data.data.token) {
            cachedToken = response.data.data.token;
            return cachedToken;
        }
        throw new Error('Nu s-a putut obține token-ul');
    } catch (error) {
        console.error('Eroare autentificare API:', error.message);
        throw error;
    }
}

const CITY_CODES = {
    'CJ': 54984,  // Cluj-Napoca
    'B': 179132,  // Bucuresti Sector 1
    'TM': 155252, // Timisoara
    'IS': 95079,  // Iasi
    'BV': 40205,  // Brasov
    'CT': 60428,  // Constanta
    'DJ': 70007,  // Craiova
    'PH': 130543, // Ploiesti
    'GL': 75118,  // Galati
    'BH': 26573,  // Oradea
    'SB': 143469, // Sibiu
    'BC': 20297,  // Bacau
    'AR': 9271,   // Arad
    'MS': 114328, // Targu Mures
    'DB': 65351,  // Targoviste
    'AG': 13178,  // Pitesti
};

function getCityCode(county) {
    const code = county ? county.toUpperCase().trim() : 'CJ';
    return CITY_CODES[code] || 54984;
}

const PROVIDERS = ['axeria', 'hellas_autonom', 'hellas_nextins', 'eazy_insure', 'groupama', 'asirom'];

function buildOfferPayload(provider, formData) {
    const county = (formData.county || 'CJ').toUpperCase().trim();
    const cityCode = getCityCode(county);

    return {
        provider: {
            organization: { businessName: provider }
        },
        product: {
            motor: {
                startDate: formData.startDate,
                termTime: 12,
                installmentCount: 1
            },
            policyholder: {
                lastName: formData.lastName,
                firstName: formData.firstName,
                taxId: formData.taxId,
                email: "client@example.com",
                mobileNumber: "0722000000",
                identification: {
                    idType: "CI",
                    idNumber: formData.idNumber
                },
                drivingLicense: {
                    issueDate: formData.licenseIssueDate
                },
                address: {
                    county: county,
                    city: formData.city,
                    cityCode: cityCode,
                    street: formData.street,
                    houseNumber: formData.houseNumber,
                    postcode: formData.postcode,
                    floor: "1"
                }
            },
            vehicle: {
                registrationType: "registered",
                licensePlate: formData.licensePlate,
                vin: formData.vin,
                vehicleType: formData.vehicleType,
                brand: formData.brand,
                model: formData.model,
                yearOfConstruction: parseInt(formData.year),
                engineDisplacement: parseInt(formData.engineDisplacement),
                enginePower: parseInt(formData.enginePower),
                totalWeight: parseInt(formData.totalWeight),
                seats: parseInt(formData.seats),
                fuelType: formData.fuelType,
                usageType: "personal",
                identification: { idNumber: "H123456" },
                firstRegistration: formData.firstRegistration,
                currentMileage: parseInt(formData.currentMileage)
            }
        }
    };
}

app.post('/api/calculate', async (req, res) => {
    try {
        const formData = req.body;
        const token = await getAuthToken();

        const requests = PROVIDERS.map(provider => {
            const payload = buildOfferPayload(provider, formData);
            return axios.post(`${process.env.API_BASE_URL}/offer`, payload, {
                headers: { 
                    'Token': token,
                    'Content-Language': 'ro'
                }
            }).then(res => ({ provider, response: res }))
              .catch(err => ({ provider, error: err.response ? err.response.data : err.message }));
        });

        const results = await Promise.all(requests);
        const validOffers = [];

        results.forEach(item => {
            if (item.response && item.response.status === 200 && item.response.data && !item.response.data.error && item.response.data.data.offers) {
                const offer = item.response.data.data.offers[0];
                if (offer) {
                    validOffers.push({
                        provider: item.provider,
                        offerId: offer.offerId,
                        premiumAmount: offer.premiumAmount,
                        currency: offer.currency
                    });
                }
            } else if (item.error) {
                console.warn(`[${item.provider}] Eroare ofertare:`, item.error);
            }
        });

        await logAction('CALCULATE_OFFERS', formData, validOffers);

        res.json({ success: true, offers: validOffers });
    } catch (error) {
        console.error('Error fetching offers:', error);
        await logAction('CALCULATE_OFFERS_ERROR', req.body, { error: error.message });
        res.status(500).json({ success: false, message: 'A apărut o eroare la calcularea ofertelor.' });
    }
});


function formatPdfFileName(rawName, offerId) {
    return `Polita_RCA_${offerId}.pdf`;
}

app.get('/api/pdf/:offerId', async (req, res) => {
    try {
        const { offerId } = req.params;
        const isDownload = req.query.download === '1' || req.query.download === 'true';
        const token = await getAuthToken();

        const pdfResponse = await axios.get(`${process.env.API_BASE_URL}/offer/${offerId}`, {
            headers: { 'Token': token }
        });

        if (pdfResponse.data && !pdfResponse.data.error && pdfResponse.data.data.files && pdfResponse.data.data.files[0]) {
            const file = pdfResponse.data.data.files[0];
            const fileName = formatPdfFileName(file.name, offerId);
            const pdfBuffer = Buffer.from(file.content, 'base64');
            res.setHeader('Content-Type', 'application/pdf');
            const disposition = isDownload ? 'attachment' : 'inline';
            res.setHeader('Content-Disposition', `${disposition}; filename="${fileName}"`);
            return res.send(pdfBuffer);
        }

        res.status(404).send('PDF-ul nu a fost găsit pentru această ofertă.');
    } catch (error) {
        console.error('Error serving PDF:', error.message);
        res.status(500).send('Eroare la încărcarea fișierului PDF.');
    }
});

app.post('/api/buy', async (req, res) => {
    try {
        const { offerId } = req.body;
        const token = await getAuthToken();

        const pdfResponse = await axios.get(`${process.env.API_BASE_URL}/offer/${offerId}`, {
            headers: { 'Token': token }
        });

        let pdfBase64 = null;
        let fileName = `Polita_RCA_${offerId}.pdf`;
        if (pdfResponse.data && !pdfResponse.data.error && pdfResponse.data.data.files && pdfResponse.data.data.files[0]) {
            pdfBase64 = pdfResponse.data.data.files[0].content;
            fileName = formatPdfFileName(pdfResponse.data.data.files[0].name, offerId);
        }

        await logAction('BUY_OFFER', { offerId }, { success: true, hasPdf: !!pdfBase64 });

        res.json({
            success: true,
            message: 'Oferta a fost emisă cu succes!',
            offerId,
            fileName,
            pdfUrl: `/api/pdf/${offerId}`,
            downloadUrl: `/api/pdf/${offerId}?download=1`,
            pdfBase64
        });
    } catch (error) {
        console.error('Error buying offer:', error);
        await logAction('BUY_OFFER_ERROR', req.body, { error: error.message });
        res.status(500).json({ success: false, message: 'Eroare la procesarea ofertei.' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Serverul rulează pe http://localhost:${PORT}`);
});
