// Konfigurasi Sumber Data (Bisa diganti URL API nantinya)
const DATA_SOURCE = "./data/kopdes.json";

// State Aplikasi
let map;
let userMarker = null;
let kopdesData = [];
let kopdesMarkers = [];
let userLocation = null; // { lat, lng }

// Elemen DOM
const mapEl = document.getElementById('map');
const listEl = document.getElementById('kopdes-list');
const statusEl = document.getElementById('location-status');
const searchInput = document.getElementById('search-input');
const distanceFilter = document.getElementById('distance-filter');
const btnMyLocation = document.getElementById('btn-my-location');

// 1. Inisialisasi Peta
function initMap() {
    // Default view (tengah pulau Jawa)
    map = L.map('map').setView([-7.5, 110.0], 7);

    // Load tiles dari OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // Fitur Lokasi Manual via Klik Peta
    map.on('click', function(e) {
        setUserLocation(e.latlng.lat, e.latlng.lng, "Manual");
    });
}

// 2. Load Data Kopdes
async function loadKopdesData() {
    try {
        const response = await fetch(DATA_SOURCE);
        if (!response.ok) throw new Error("Gagal memuat data");
        kopdesData = await response.json();
        
        renderMapMarkers();
        updateList();
    } catch (error) {
        listEl.innerHTML = `<div class="error-msg">⚠️ Data Kopdes gagal dimuat. Pastikan Anda menjalankan project melalui Local Web Server.</div>`;
        console.error(error);
    }
}

// 3. Render Marker Kopdes di Peta
function renderMapMarkers() {
    // Bersihkan marker lama jika ada
    kopdesMarkers.forEach(marker => map.removeLayer(marker));
    kopdesMarkers = [];

    // Icon khusus Kopdes (Merah)
    const kopdesIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
        iconAnchor: [12, 41],
        popupAnchor: [1, -34]
    });

    kopdesData.forEach(kopdes => {
        const marker = L.marker([kopdes.latitude, kopdes.longitude], { icon: kopdesIcon })
            .addTo(map);
        
        // Buat Popup
        const googleMapsLink = `https://www.google.com/maps/dir/?api=1&destination=${kopdes.latitude},${kopdes.longitude}`;
        const popupContent = `
            <h4>${kopdes.name}</h4>
            <p>📍 ${kopdes.address}</p>
            <a href="${googleMapsLink}" target="_blank" class="popup-btn-nav">🧭 Buka Navigasi</a>
        `;
        
        marker.bindPopup(popupContent);
        
        // Simpan referensi marker ke data asli untuk sinkronisasi list -> map
        kopdes.marker = marker;
        kopdesMarkers.push(marker);
    });
}

// 4. Deteksi Lokasi Pengguna (GPS)
function requestGPSLocation() {
    updateStatus("🟡 Mencari lokasi...", "status-waiting");

    if (!navigator.geolocation) {
        updateStatus("🔴 Geolocation tidak didukung", "status-error");
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            setUserLocation(position.coords.latitude, position.coords.longitude, "GPS");
        },
        (error) => {
            updateStatus("🔴 Izin lokasi ditolak/gagal. Klik peta untuk set manual.", "status-error");
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

// Set Lokasi Pengguna & Update Kalkulasi
function setUserLocation(lat, lng, source) {
    userLocation = { lat, lng };
    
    // Update Marker Pengguna
    if (userMarker) {
        map.removeLayer(userMarker);
    }
    userMarker = L.marker([lat, lng]).addTo(map).bindPopup(`Lokasi Anda (${source})`).openPopup();
    
    // Pindahkan kamera ke pengguna
    map.setView([lat, lng], 13);
    updateStatus("🟢 Lokasi aktif", "status-active");
    
    // Hitung ulang data dan perbarui tampilan
    updateList();
}

// 5. Rumus Haversine (Menghitung Jarak Koordinat)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Radius bumi dalam meter
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Hasil dalam meter
}

function formatDistance(meters) {
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
}

// 6. Update Daftar Kopdes (Panel Bawah)
function updateList() {
    const searchQuery = searchInput.value.toLowerCase();
    const maxDistance = distanceFilter.value; // "all", "1", "5", "10"

    // Hitung jarak untuk setiap kopdes
    let processedData = kopdesData.map(kopdes => {
        let dist = Infinity;
        if (userLocation) {
            dist = calculateDistance(userLocation.lat, userLocation.lng, kopdes.latitude, kopdes.longitude);
        }
        return { ...kopdes, distanceValue: dist };
    });

    // Terapkan Pencarian (Search)
    if (searchQuery) {
        processedData = processedData.filter(k => 
            k.name.toLowerCase().includes(searchQuery) ||
            k.address.toLowerCase().includes(searchQuery)
        );
    }

    // Terapkan Filter Jarak (jika lokasi tersedia)
    if (userLocation && maxDistance !== "all") {
        const maxMeters = parseInt(maxDistance) * 1000;
        processedData = processedData.filter(k => k.distanceValue <= maxMeters);
    }

    // Urutkan dari yang terdekat
    processedData.sort((a, b) => a.distanceValue - b.distanceValue);

    // Render HTML
    listEl.innerHTML = '';
    if (processedData.length === 0) {
        listEl.innerHTML = '<p style="text-align:center; color:#777;">Tidak ada Kopdes yang ditemukan.</p>';
        return;
    }

    processedData.forEach((kopdes, index) => {
        const distStr = userLocation ? formatDistance(kopdes.distanceValue) : "Jarak belum diketahui (Set lokasi)";
        
        const card = document.createElement('div');
        card.className = 'kopdes-card';
        card.innerHTML = `
            <h4>${index + 1}. ${kopdes.name}</h4>
            <p>📍 ${kopdes.district}, ${kopdes.regency}</p>
            <p class="kopdes-distance">📏 ${distStr}</p>
        `;
        
        // Interaksi klik card -> Pindah fokus peta
        card.addEventListener('click', () => {
            map.setView([kopdes.latitude, kopdes.longitude], 15);
            kopdes.marker.openPopup();
        });

        listEl.appendChild(card);
    });
}

// Utilitas UI
function updateStatus(text, className) {
    statusEl.textContent = text;
    statusEl.className = `status-badge ${className}`;
}

// Event Listeners
searchInput.addEventListener('input', updateList);
distanceFilter.addEventListener('change', updateList);
btnMyLocation.addEventListener('click', requestGPSLocation);

// Jalankan saat aplikasi dibuka
window.onload = () => {
    initMap();
    loadKopdesData();
    // Minta lokasi setelah 1 detik peta terbuka
    setTimeout(requestGPSLocation, 1000);
};

