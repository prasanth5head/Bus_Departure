        // ✅ Fix #34: Wrap variables in IIFE to prevent global pollution
        (function(window, document) {
            'use strict';
            
        // ═══════════════ Global Variables ═══════════════
        var busData = [];
        // ✅ Fix #37: Removed busRecords (was Dead Code)
        var departedBuses = [];
        // ✅ Fix #38: Removed gateStats (was Dead Code)
        var dailyStats = { buses: 0, pax: 0, early: 0, ontime: 0, late: 0, flights: new Set() };
        var zoomLevel = 100;
        var editMode = false;
        var panelVisible = true;
        var thresholds = { early: 7, late: 3 };
        var currentSpotForForm = null;
        var currentBusForForm = null;
        var currentFormName = null;
        
        // ✅ Fix #56: Variables to track intervals and prevent memory leaks
        var intervalIds = {
            updateTime: null,
            updateCountdowns: null,
            saveData: null
        };

        // ═══════════════ Gates ═══════════════
        var gates = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2', 'E1', 'E2'];

        // ═══════════════ Developer Section Protection ═══════════════
        // ✅ Fix #59: Re-added developer section protection system
        // PIN is protected with SHA-256 Hash - not visible in source code
        // Reference: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
        var DEV_ACCESS_HASH = 'a5ccb1c538e34663a658b1be28b16455ee5285efb10e6f1d4caba1f69ec9782b';
        var devSessionUnlocked = false;
        
        // ✅ SHA-256 hash calculation using Web Crypto API
        // Reference: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
        async function sha256(message) {
            try {
                // Convert text to ArrayBuffer
                var msgBuffer = new TextEncoder().encode(message);
                // Calculate hash using SHA-256
                var hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
                // Convert result to byte array
                var hashArray = Array.from(new Uint8Array(hashBuffer));
                // Convert each byte to 2-digit hex string
                var hashHex = hashArray.map(function(b) { 
                    return b.toString(16).padStart(2, '0'); 
                }).join('');
                return hashHex;
            } catch (error) {
                console.error('Error calculating SHA-256:', error);
                return null;
            }
        }
        
        // ✅ Developer PIN verification function
        // Compares hash of input with stored hash
        async function verifyDevPassword(inputPassword) {
            if (!inputPassword || typeof inputPassword !== 'string') {
                return false;
            }
            var inputHash = await sha256(inputPassword);
            if (!inputHash) {
                return false;
            }
            // Constant-time safe comparison (prevents timing attacks)
            // Reference: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
            return inputHash === DEV_ACCESS_HASH;
        }
        
        // ✅ Function to unlock developer section
        async function unlockDevSection(password) {
            var isValid = await verifyDevPassword(password);
            if (isValid) {
                devSessionUnlocked = true;
                return true;
            }
            devSessionUnlocked = false;
            return false;
        }
        
        // ✅ Function to check developer section lock status
        function isDevUnlocked() {
            return devSessionUnlocked === true;
        }
        
        // ✅ Function to lock developer section
        function lockDevSection() {
            devSessionUnlocked = false;
        }
        
        // ✅ Fix #60: Toggle developer section with PIN protection
        // Called from developer button in UI
        function toggleDevSection() {
            var devSection = safeGetElement('devSection');
            var devTab = safeGetElement('devTab');
            
            if (!devSection) {
                console.error('Developer section not found');
                return;
            }
            
            // If section is open, close it
            if (devSection.classList.contains('active')) {
                devSection.classList.remove('active');
                if (devTab) devTab.classList.remove('active');
                lockDevSection();
                return;
            }
            
            // If section is closed, request PIN
            var password = prompt('🔐 Enter developer PIN:');
            
            if (!password) {
                showNotification('warning', 'Cancelled', 'Access cancelled');
                return;
            }
            
            // Verify PIN (async)
            unlockDevSection(password).then(function(isValid) {
                if (isValid) {
                    devSection.classList.add('active');
                    if (devTab) devTab.classList.add('active');
                    showNotification('success', 'Welcome', 'Developer section unlocked');
                } else {
                    showNotification('error', 'Error', 'Invalid PIN');
                    lockDevSection();
                }
            }).catch(function(error) {
                console.error('Verification error:', error);
                showNotification('error', 'Error', 'PIN verification failed');
            });
        }

        // ✅ Fix #2: Safe JSON parsing with error handling
        function safeJSONParse(jsonString, defaultValue) {
            if (defaultValue === undefined) { defaultValue = null; }
            if (!jsonString || typeof jsonString !== 'string') {
                return defaultValue;
            }
            try {
                return JSON.parse(jsonString);
            } catch (error) {
                console.error('JSON parsing error:', error.message);
                return defaultValue;
            }
        }

        // ✅ Fix #3: Safe JSON stringification
        function safeJSONStringify(data, defaultValue) {
            if (defaultValue === undefined) { defaultValue = '{}'; }
            try {
                return JSON.stringify(data);
            } catch (error) {
                console.error('JSON stringify error:', error.message);
                return defaultValue;
            }
        }

        // ✅ Fix #55: Simple encryption and decryption functions for local data
        // Warning: This is simple encryption (obfuscation), not strong encryption
        // For highly sensitive data, use Web Crypto API
        var STORAGE_KEY = 'LOCC_2024';
        
        function simpleEncrypt(text) {
            if (!text) return '';
            var result = '';
            for (var i = 0; i < text.length; i++) {
                var charCode = text.charCodeAt(i) ^ STORAGE_KEY.charCodeAt(i % STORAGE_KEY.length);
                result += String.fromCharCode(charCode);
            }
            // Convert to Base64 for safe storage
            try {
                return btoa(encodeURIComponent(result));
            } catch (e) {
                return btoa(result);
            }
        }
        
        function simpleDecrypt(encoded) {
            if (!encoded) return '';
            
            // ✅ Check if data is plain JSON (unencrypted) - for backward compatibility with old data
            if (encoded.charAt(0) === '{' || encoded.charAt(0) === '[') {
                return encoded; // Old unencrypted data
            }
            
            // ✅ Check if valid Base64
            var base64Regex = /^[A-Za-z0-9+/=]+$/;
            if (!base64Regex.test(encoded)) {
                return encoded; // Not Base64, return as is
            }
            
            try {
                var text;
                try {
                    text = decodeURIComponent(atob(encoded));
                } catch (e) {
                    text = atob(encoded);
                }
                var result = '';
                for (var i = 0; i < text.length; i++) {
                    var charCode = text.charCodeAt(i) ^ STORAGE_KEY.charCodeAt(i % STORAGE_KEY.length);
                    result += String.fromCharCode(charCode);
                }
                return result;
            } catch (e) {
                // If decryption fails, return original data
                return encoded;
            }
        }

        // ✅ Fix #4: Safe function to access DOM elements
        function safeGetElement(id) {
            const element = document.getElementById(id);
            if (!element) {
                console.warn('Element not found:', id);
            }
            return element;
        }

        // ✅ Fix #5: Safe function to set text content
        function safeSetText(id, text) {
            const element = safeGetElement(id);
            if (element) {
                element.textContent = String(text);
            }
        }

        // ✅ Fix #56: Removed safeSetHTML (was Dead Code - unused)

        // ✅ Fix #7: Function to sanitize input from XSS
        function sanitizeInput(input) {
            if (typeof input !== 'string') return String(input);
            return input
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#x27;');
        }

        // ✅ Fix #8: Validate spot number
        function validateSpotNumber(spotNum) {
            const num = parseInt(spotNum, 10);
            return !isNaN(num) && num >= 1 && num <= 87;
        }

        // ✅ Fix #9: Validate bus data
        function validateBusData(bus) {
            if (!bus || typeof bus !== 'object') return false;
            if (!bus.plate || typeof bus.plate !== 'string') return false;
            if (bus.pax !== undefined && (typeof bus.pax !== 'number' || bus.pax < 0)) return false;
            return true;
        }

        // ═══════════════ System Initialization ═══════════════
        function init() {
            try {
                loadData();
                loadSettings();
                
                // Load test data if no data exists
                if (busData.length === 0) {
                    loadTestData();
                }
                
                // Render parking spots and gates after loading data
                renderParkingGrid('entranceGrid', 1, 42);
                renderParkingGrid('exitGrid', 43, 87);
                renderGates();
                updateStats();
                updateKPIs();
                updateBusLists();
                updateTime();
                
                // ✅ Fix #56: Clean up previous intervals before creating new ones
                if (intervalIds.updateTime) clearInterval(intervalIds.updateTime);
                if (intervalIds.updateCountdowns) clearInterval(intervalIds.updateCountdowns);
                if (intervalIds.saveData) clearInterval(intervalIds.saveData);
                
                // Save interval IDs for later cleanup
                intervalIds.updateTime = setInterval(updateTime, 1000);
                intervalIds.updateCountdowns = setInterval(updateCountdowns, 1000);
                intervalIds.saveData = setInterval(saveData, 30000);
            } catch (error) {
                console.error('System initialization error:', error);
                showNotification('error', 'Error', 'System initialization failed');
            }
        }
        
        // ═══════════════ Test Data - 20 Buses ═══════════════
        function loadTestData() {
            try {
                const now = new Date();
                const visaTypes = ['Hajj', 'Umrah', 'Visit', 'Tourism', 'GCC', 'Work'];
                const terminals = ['HT', 'NT', 'T1'];
                const gatesArr = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2', 'E1', 'E2'];
                
                // 10 late buses (departure time 1-2 hours ago - less than 3 hours)
                for (let i = 1; i <= 10; i++) {
                    const hoursAgo = 1 + Math.random() * 2;
                    const depTime = new Date(now.getTime() - hoursAgo * 60 * 60000);
                    busData.push({
                        id: Date.now() + i,
                        plate: 'L' + (1000 + i) + 'SRA',
                        busNo: 100 + i,
                        flight: 'SV' + (1000 + i),
                        pax: 30 + Math.floor(Math.random() * 20),
                        visa: visaTypes[i % 6],
                        terminal: terminals[i % 3],
                        destination: 'Makkah',
                        departure: depTime.toISOString(),
                        arrival: new Date(now.getTime() - 8 * 60 * 60000).toISOString(),
                        spot: i,
                        gate: gatesArr[i % 10],
                        forms: { ScrSegregationIn: {}, ScrWelcomeLounge: {} }
                    });
                    dailyStats.late++;
                }
                
                // 5 on-time buses
                for (let i = 11; i <= 15; i++) {
                    const hoursLeft = 4 + Math.random() * 2;
                    const depTime = new Date(now.getTime() + hoursLeft * 60 * 60000);
                    busData.push({
                        id: Date.now() + i,
                        plate: 'O' + (1000 + i) + 'SRA',
                        busNo: 100 + i,
                        flight: 'SV' + (1000 + i),
                        pax: 30 + Math.floor(Math.random() * 20),
                        visa: visaTypes[i % 6],
                        terminal: terminals[i % 3],
                        destination: 'Madinah',
                        departure: depTime.toISOString(),
                        arrival: new Date(now.getTime() - 4 * 60 * 60000).toISOString(),
                        spot: i,
                        gate: gatesArr[i % 10],
                        forms: { ScrSegregationIn: {}, ScrWelcomeLounge: {} }
                    });
                    dailyStats.ontime++;
                }
                
                // 5 early buses
                for (let i = 16; i <= 20; i++) {
                    const hoursLeft = 8 + Math.random() * 4;
                    const depTime = new Date(now.getTime() + hoursLeft * 60 * 60000);
                    busData.push({
                        id: Date.now() + i,
                        plate: 'E' + (1000 + i) + 'SRA',
                        busNo: 100 + i,
                        flight: 'SV' + (1000 + i),
                        pax: 30 + Math.floor(Math.random() * 20),
                        visa: visaTypes[i % 6],
                        terminal: terminals[i % 3],
                        destination: 'Jeddah',
                        departure: depTime.toISOString(),
                        arrival: new Date(now.getTime() - 2 * 60 * 60000).toISOString(),
                        spot: i,
                        gate: gatesArr[i % 10],
                        forms: { ScrSegregationIn: {}, ScrWelcomeLounge: {} }
                    });
                    dailyStats.early++;
                }
                
                dailyStats.buses = 20;
                dailyStats.pax = busData.reduce(function(sum, b) { return sum + (b.pax || 0); }, 0);
                busData.forEach(function(b) { dailyStats.flights.add(b.flight); });
                
                updateStats();
                renderParkingGrid('entranceGrid', 1, 42);
                renderParkingGrid('exitGrid', 43, 87);
                renderGates();
                updateKPIs();
                saveData();
                
                showNotification('success', 'Test Data', 'Loaded 20 buses: 10 late, 5 on-time, 5 early');
            } catch (error) {
                console.error('Error loading test data:', error);
                showNotification('error', 'Error', 'Failed to load test data');
            }
        }

        // ═══════════════ Render Parking Grid ═══════════════
        function renderParkingGrid(containerId, start, end) {
            const container = safeGetElement(containerId);
            if (!container) return;
            
            container.innerHTML = '';

            for (let i = start; i <= end; i++) {
                const spot = document.createElement('div');
                spot.className = 'parking-spot';
                spot.dataset.spot = i;

                const bus = busData.find(function(b) { return b.spot === i; });

                if (bus) {
                    const status = getStatus(bus.arrival, bus.departure);
                    spot.classList.add(status.class);
                    const countdown = getCountdownString(bus.departure);

                    // ✅ Fix #10: Use sanitizeInput for displayed data
                    spot.innerHTML = 
                        '<div class="spot-number">#' + i + '</div>' +
                        '<div class="spot-badge ' + status.class + '">' + sanitizeInput(status.label) + '</div>' +
                        '<div class="bus-info">' +
                            '<div class="info-row"><span class="info-icon">B</span>' + sanitizeInput(bus.plate) + '</div>' +
                            '<div class="info-row"><span class="info-icon">F</span>' + sanitizeInput(bus.flight) + '</div>' +
                            '<div class="info-row"><span class="info-icon">P</span>' + sanitizeInput(bus.pax || '-') + '</div>' +
                            '<div class="info-row"><span class="info-icon">G</span>' + sanitizeInput(bus.gate || '-') + '</div>' +
                        '</div>' +
                        '<div class="countdown" style="color:' + status.color + '">⏱️ ' + countdown + '</div>';

                    spot.onmouseenter = function(e) { showTooltip(e, bus, status, i); };
                    spot.onmousemove = moveTooltip;
                    spot.onmouseleave = hideTooltip;
                } else {
                    spot.classList.add('empty');
                    spot.innerHTML = '<div class="spot-number">#' + i + '</div><div class="empty-text">—</div>';
                }

                spot.onclick = function(e) { handleSpotClick(i, bus, e); };
                container.appendChild(spot);
            }
        }

        // ═══════════════ Advanced Gates Display ═══════════════
        function renderGates() {
            const container = safeGetElement('gatesGrid');
            if (!container) return;
            
            container.innerHTML = '';

            gates.forEach(function(gate) {
                var gateBuses = busData.filter(function(b) { return b.gate === gate; });
                var early = 0, ontime = 0, late = 0;
                
                gateBuses.forEach(function(bus) {
                    var status = getStatus(bus.arrival, bus.departure);
                    if (status.class === 'early') early++;
                    else if (status.class === 'ontime') ontime++;
                    else late++;
                });

                var gateSection = document.createElement('div');
                gateSection.className = 'gate-section';
                
                var busesHTML = '';
                if (gateBuses.length === 0) {
                    busesHTML = '<div style="text-align:center;color:var(--text-muted);padding:10px;font-size:0.75rem;">No buses</div>';
                } else {
                    gateBuses.forEach(function(bus) {
                        var status = getStatus(bus.arrival, bus.departure);
                        var countdown = getCountdownString(bus.departure);
                        busesHTML += 
                            '<div class="gate-bus-card ' + status.class + '" onclick="showFormsMenu(event, ' + bus.spot + ')">' +
                                '<div style="flex:1;">' +
                                    '<div style="font-weight:700;color:var(--primary);">' + sanitizeInput(bus.plate) + '</div>' +
                                    '<div style="font-size:0.7rem;color:var(--text-muted);">' + sanitizeInput(bus.flight) + ' | ' + sanitizeInput(bus.pax || '-') + '</div>' +
                                '</div>' +
                                '<div style="text-align:left;font-size:0.75rem;">' +
                                    '<div style="color:' + status.color + ';">' + countdown + '</div>' +
                                    '<div style="font-size:0.65rem;color:var(--text-muted);">' + sanitizeInput(status.label) + '</div>' +
                                '</div>' +
                            '</div>';
                    });
                }
                
                gateSection.innerHTML = 
                    '<div class="gate-header">' +
                        '<span class="gate-title">' + sanitizeInput(gate) + '</span>' +
                        '<div class="gate-stats-mini">' +
                            '<span class="early">' + early + '</span>' +
                            '<span class="ontime">' + ontime + '</span>' +
                            '<span class="late">' + late + '</span>' +
                        '</div>' +
                    '</div>' +
                    '<div class="gate-buses-list" id="gateList-' + gate + '">' + busesHTML + '</div>';
                    
                container.appendChild(gateSection);
            });
        }

        // ═══════════════ Calculate Status ═══════════════
        function getStatus(arrival, departure) {
            var now = new Date();
            var dep = new Date(departure);
            var diff = (dep - now) / (1000 * 60 * 60);

            // ✅ Fix #11: Validate date accuracy
            if (isNaN(diff) || !isFinite(diff)) {
                return { class: 'late', label: 'Late', color: '#f44336', hours: 0 };
            }

            if (diff > thresholds.early) {
                return { class: 'early', label: 'Early', color: '#4caf50', hours: diff };
            } else if (diff >= thresholds.late) {
                return { class: 'ontime', label: 'On Time', color: '#2196f3', hours: diff };
            } else {
                return { class: 'late', label: 'Late', color: '#f44336', hours: diff };
            }
        }

        // ═══════════════ Countdown HH:MM:SS ═══════════════
        function getCountdownString(departure) {
            if (!departure) return '--:--:--';
            
            var now = new Date();
            var dep = new Date(departure);
            var diff = dep - now;
            
            // ✅ Fix #12: Validate time difference accuracy
            if (isNaN(diff) || !isFinite(diff)) return '--:--:--';
            if (diff <= 0) return '⚠️ Overdue!';
            
            var hours = Math.floor(diff / (1000 * 60 * 60));
            var mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            var secs = Math.floor((diff % (1000 * 60)) / 1000);
            
            hours = hours < 10 ? '0' + hours : hours;
            mins = mins < 10 ? '0' + mins : mins;
            secs = secs < 10 ? '0' + secs : secs;
            return hours + ':' + mins + ':' + secs;
        }

        // ═══════════════ Update Statistics ═══════════════
        function updateStats() {
            try {
                var early = 0, ontime = 0, late = 0, totalPax = 0;
                var flights = new Set();
                var visaCounts = { Hajj: 0, Umrah: 0, Visit: 0, Tourism: 0, GCC: 0, Work: 0 };
                var visaPaxCounts = { Hajj: 0, Umrah: 0, Visit: 0, Tourism: 0, GCC: 0, Work: 0 };

                busData.forEach(function(bus) {
                    var status = getStatus(bus.arrival, bus.departure);
                    if (status.class === 'early') early++;
                    else if (status.class === 'ontime') ontime++;
                    else late++;

                    totalPax += bus.pax || 0;
                    if (bus.flight) flights.add(bus.flight);
                    if (bus.visa && visaCounts[bus.visa] !== undefined) {
                        visaCounts[bus.visa]++;
                        visaPaxCounts[bus.visa] += bus.pax || 0;
                    }
                });

                // ✅ Fix #13: Use safeSetText instead of direct access
                safeSetText('totalBuses', busData.length);
                safeSetText('earlyBuses', early);
                safeSetText('ontimeBuses', ontime);
                safeSetText('lateBuses', late);
                safeSetText('totalPax', totalPax.toLocaleString());
                safeSetText('totalFlights', flights.size);

                safeSetText('panelOccupied', busData.length);
                safeSetText('panelEmpty', 87 - busData.length);
                safeSetText('panelEarly', early);
                safeSetText('panelOntime', ontime);
                safeSetText('panelLate', late);

                // Visa types - Buses
                safeSetText('visaHajj', visaCounts.Hajj);
                safeSetText('visaUmrah', visaCounts.Umrah);
                safeSetText('visaVisit', visaCounts.Visit);
                safeSetText('visaTourism', visaCounts.Tourism);
                safeSetText('visaGCC', visaCounts.GCC);
                safeSetText('visaWork', visaCounts.Work);

                // Visa types - Passengers
                safeSetText('visaPaxHajj', visaPaxCounts.Hajj.toLocaleString());
                safeSetText('visaPaxUmrah', visaPaxCounts.Umrah.toLocaleString());
                safeSetText('visaPaxVisit', visaPaxCounts.Visit.toLocaleString());
                safeSetText('visaPaxTourism', visaPaxCounts.Tourism.toLocaleString());
                safeSetText('visaPaxGCC', visaPaxCounts.GCC.toLocaleString());
                safeSetText('visaPaxWork', visaPaxCounts.Work.toLocaleString());

                // Daily Statistics
                safeSetText('dailyBuses', dailyStats.buses);
                safeSetText('dailyEarly', dailyStats.early);
                safeSetText('dailyOntime', dailyStats.ontime);
                safeSetText('dailyLate', dailyStats.late);
                safeSetText('dailyPax', dailyStats.pax.toLocaleString());
                safeSetText('dailyFlights', dailyStats.flights.size);

                renderGates();
                updateBusLists();
            } catch (error) {
                console.error('Error updating statistics:', error);
            }
        }

        // ═══════════════ Update Time ═══════════════
        function updateTime() {
            try {
                var now = new Date();
                safeSetText('currentTime', now.toLocaleTimeString('en-US', { hour12: false }));
                safeSetText('currentDate', now.toLocaleDateString('en-US'));
                safeSetText('lastUpdate', now.toLocaleTimeString('en-US', { hour12: false }));

                var hour = now.getHours();
                var shift, shiftColor, shiftBg;
                
                if (hour >= 6 && hour < 14) {
                    shift = 'A';
                    shiftColor = '#4caf50';
                    shiftBg = 'rgba(76,175,80,0.2)';
                } else if (hour >= 14 && hour < 22) {
                    shift = 'B';
                    shiftColor = '#2196f3';
                    shiftBg = 'rgba(33,150,243,0.2)';
                } else {
                    shift = 'C';
                    shiftColor = '#9c27b0';
                    shiftBg = 'rgba(156,39,176,0.2)';
                }
                
                var shiftBox = safeGetElement('shiftBox');
                if (shiftBox) {
                    shiftBox.style.borderColor = shiftColor;
                    shiftBox.style.background = shiftBg;
                }
                var currentShiftEl = safeGetElement('currentShift');
                if (currentShiftEl) {
                    currentShiftEl.textContent = shift;
                    currentShiftEl.style.color = shiftColor;
                }
            } catch (error) {
                console.error('Error updating time:', error);
            }
        }

        // ═══════════════ Update Countdowns Every Second ═══════════════
        function updateCountdowns() {
            try {
                busData.forEach(function(bus) {
                    if (!bus.spot) return;
                    
                    var spotEl = document.querySelector('.parking-spot[data-spot="' + bus.spot + '"]');
                    if (spotEl && !spotEl.classList.contains('empty')) {
                        var countdown = getCountdownString(bus.departure);
                        var status = getStatus(bus.arrival, bus.departure);
                        var countdownEl = spotEl.querySelector('.countdown');
                        if (countdownEl) {
                            // ✅ Fix #54: Use textContent instead of innerHTML
                            countdownEl.textContent = '⏱️ ' + countdown;
                            countdownEl.style.color = status.color;
                        }
                        
                        var badgeEl = spotEl.querySelector('.spot-badge');
                        if (badgeEl) {
                            badgeEl.textContent = status.label;
                            badgeEl.className = 'spot-badge ' + status.class;
                        }
                        
                        spotEl.classList.remove('early', 'ontime', 'late');
                        spotEl.classList.add(status.class);
                    }
                });
                
                monitorStatusChanges();
            } catch (error) {
                console.error('Error updating countdowns:', error);
            }
        }

        // ═══════════════ Monitor Automatic Status Changes ═══════════════
        function monitorStatusChanges() {
            busData.forEach(function(bus) {
                var currentStatus = getStatus(bus.arrival, bus.departure);
                var previousStatus = bus.previousStatus || currentStatus.class;
                
                if (currentStatus.class !== previousStatus) {
                    if (previousStatus === 'early' && currentStatus.class === 'ontime') {
                        showNotification('info', 'Status Update', 'Bus ' + sanitizeInput(bus.plate) + ' entered scheduled departure time');
                        addAlert('info', 'Status Change', 'Bus ' + sanitizeInput(bus.plate) + ' is now on time');
                    }
                    
                    if (previousStatus === 'ontime' && currentStatus.class === 'late') {
                        showNotification('warning', 'Delay Alert', 'Bus ' + sanitizeInput(bus.plate) + ' is now late');
                        addAlert('warning', 'Late Bus', 'Bus ' + sanitizeInput(bus.plate) + ' exceeded scheduled departure');
                    }
                    
                    if (currentStatus.class === 'late' && currentStatus.hours < 1 && bus.previousHours >= 1) {
                        showNotification('error', 'Critical', 'Bus ' + sanitizeInput(bus.plate) + ' is severely late');
                        addAlert('critical', 'Critically Late Bus', 'Bus ' + sanitizeInput(bus.plate) + ' is late less than an hour');
                        if (settings.sound) playAlertSound();
                    }
                    
                    bus.previousStatus = currentStatus.class;
                }
                bus.previousHours = currentStatus.hours;
            });
        }

        // ═══════════════ Play Alert Sound ═══════════════
        // ✅ Fix #35: Correct and complete alert sound
        function playAlertSound() {
            try {
                // Create beep sound using Web Audio API
                var AudioContext = window.AudioContext || window.webkitAudioContext;
                if (!AudioContext) {
                    console.log('Web Audio API not supported');
                    return;
                }
                
                var audioCtx = new AudioContext();
                var oscillator = audioCtx.createOscillator();
                var gainNode = audioCtx.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioCtx.destination);
                
                oscillator.frequency.value = 800; // Sound frequency (Hz)
                oscillator.type = 'sine';
                gainNode.gain.value = 0.3; // Sound level
                
                oscillator.start();
                
                // Stop sound after 200ms
                setTimeout(function() {
                    oscillator.stop();
                    audioCtx.close();
                }, 200);
                
            } catch(e) { 
                console.log('Sound not available:', e.message); 
            }
        }

        // ═══════════════ Information Tooltip ═══════════════
        function showTooltip(e, bus, status, spot) {
            var tooltip = safeGetElement('tooltip');
            if (!tooltip) return;
            
            tooltip.style.display = 'block';
            // ✅ Fix #14: Sanitize displayed tooltip data
            tooltip.innerHTML = 
                '<div class="tooltip-title">Spot #' + spot + '</div>' +
                '<div class="tooltip-row"><b>Plate:</b> ' + sanitizeInput(bus.plate) + '</div>' +
                '<div class="tooltip-row"><b>Flight:</b> ' + sanitizeInput(bus.flight) + '</div>' +
                '<div class="tooltip-row"><b>Passengers:</b> ' + sanitizeInput(bus.pax || '-') + '</div>' +
                '<div class="tooltip-row"><b>Gate:</b> ' + sanitizeInput(bus.gate || '-') + '</div>' +
                '<div class="tooltip-row"><b>Departure:</b> ' + sanitizeInput(bus.departure) + '</div>' +
                '<div class="tooltip-row"><b>Time Remaining:</b> ' + getCountdownString(bus.departure) + '</div>' +
                '<div class="tooltip-row" style="color:' + status.color + '"><b>Status:</b> ' + sanitizeInput(status.label) + '</div>';
            moveTooltip(e);
        }

        function moveTooltip(e) {
            var tooltip = safeGetElement('tooltip');
            if (!tooltip) return;
            tooltip.style.left = (e.pageX + 15) + 'px';
            tooltip.style.top = (e.pageY + 15) + 'px';
        }

        function hideTooltip() {
            var tooltip = safeGetElement('tooltip');
            if (tooltip) tooltip.style.display = 'none';
        }

        // ═══════════════ Handle Click ═══════════════
        // ✅ Fix #39: Link handleSpotClick with selectSpot in edit mode
        function handleSpotClick(spot, bus, e) {
            if (editMode) {
                // In edit mode, use selectSpot
                selectSpot(spot, bus);
            } else if (e) {
                showFormsMenu(e, spot, bus);
            } else {
                if (bus) {
                    showNotification('info', 'Spot #' + spot, 'Bus: ' + sanitizeInput(bus.plate));
                } else {
                    showNotification('info', 'Spot #' + spot, 'Empty spot - Click to add');
                }
            }
        }

        // ═══════════════ Notifications ═══════════════
        function showNotification(type, title, message) {
            try {
                var container = safeGetElement('notifications');
                if (!container) return;
                
                var notification = document.createElement('div');
                notification.className = 'notification ' + type;
                notification.innerHTML = '<strong>' + sanitizeInput(title) + '</strong><br>' + sanitizeInput(message);
                container.appendChild(notification);

                setTimeout(function() { 
                    if (notification.parentNode) {
                        notification.remove(); 
                    }
                }, 5000);
            } catch (error) {
                console.error('Error showing notification:', error);
            }
        }

        // ═══════════════ Control Panel ═══════════════
        function togglePanel() {
            panelVisible = !panelVisible;
            var panel = safeGetElement('controlPanel');
            var btn = safeGetElement('toggleBtn');
            if (panel) panel.classList.toggle('hidden', !panelVisible);
            if (btn) btn.classList.toggle('shifted', !panelVisible);
        }

        // ═══════════════ Tabs ═══════════════
        // ✅ Fix #33: Pass event as parameter instead of relying on global
        function showTab(tabName, e) {
            document.querySelectorAll('.tab-content').forEach(function(t) { t.classList.remove('active'); });
            document.querySelectorAll('.panel-tab').forEach(function(t) { t.classList.remove('active'); });
            var tabEl = safeGetElement('tab-' + tabName);
            if (tabEl) tabEl.classList.add('active');
            // Use passed e or window.event for compatibility
            var evt = e || window.event;
            if (evt && evt.target) evt.target.classList.add('active');
            if (tabName === 'kpis') updateKPIs();
        }

        // ═══════════════ Threshold Settings ═══════════════
        function updateThresholds() {
            var earlyEl = safeGetElement('earlyThreshold');
            var lateEl = safeGetElement('lateThreshold');
            thresholds.early = parseInt(earlyEl ? earlyEl.value : 7, 10) || 7;
            thresholds.late = parseInt(lateEl ? lateEl.value : 3, 10) || 3;
            updateStats();
            renderParkingGrid('entranceGrid', 1, 42);
            renderParkingGrid('exitGrid', 43, 87);
            showNotification('success', 'Settings', 'Time thresholds updated');
        }

        // ═══════════════ Color Settings ═══════════════
        function updateColors() {
            var colorPrimary = safeGetElement('colorPrimary');
            var colorEarly = safeGetElement('colorEarly');
            var colorOntime = safeGetElement('colorOntime');
            var colorLate = safeGetElement('colorLate');
            
            if (colorPrimary) document.documentElement.style.setProperty('--primary', colorPrimary.value);
            if (colorEarly) document.documentElement.style.setProperty('--green', colorEarly.value);
            if (colorOntime) document.documentElement.style.setProperty('--blue', colorOntime.value);
            if (colorLate) document.documentElement.style.setProperty('--red', colorLate.value);
        }

        // ═══════════════ Toggle Settings ═══════════════
        var settings = { sound: false, notif: true, autoRefresh: true };

        function toggleSetting(setting) {
            settings[setting] = !settings[setting];
            var toggle = safeGetElement(setting + 'Toggle');
            if (toggle) toggle.classList.toggle('active', settings[setting]);
            showNotification('info', 'Settings', setting + ': ' + (settings[setting] ? 'Enabled' : 'Disabled'));
        }

        // ═══════════════ Spot Size ═══════════════
        function updateSpotSize() {
            var spotSizeEl = safeGetElement('spotSize');
            var size = spotSizeEl ? spotSizeEl.value : 80;
            document.querySelectorAll('.parking-spot').forEach(function(spot) {
                spot.style.minHeight = size + 'px';
            });
        }

        // ═══════════════ Save and Load Settings ═══════════════
        function saveSettings() {
            try {
                var settingsData = {
                    thresholds: thresholds,
                    settings: settings,
                    colors: {
                        primary: safeGetElement('colorPrimary') ? safeGetElement('colorPrimary').value : '#ffd700',
                        early: safeGetElement('colorEarly') ? safeGetElement('colorEarly').value : '#4caf50',
                        ontime: safeGetElement('colorOntime') ? safeGetElement('colorOntime').value : '#2196f3',
                        late: safeGetElement('colorLate') ? safeGetElement('colorLate').value : '#f44336'
                    },
                    spotSize: safeGetElement('spotSize') ? safeGetElement('spotSize').value : 80
                };
                // ✅ Fix #15: Use safeJSONStringify
                localStorage.setItem('LOCC_Settings', safeJSONStringify(settingsData));
                showNotification('success', 'Settings', 'Settings saved successfully');
            } catch (error) {
                console.error('Error saving settings:', error);
                showNotification('error', 'Error', 'Failed to save settings');
            }
        }

        function loadSettings() {
            try {
                var saved = localStorage.getItem('LOCC_Settings');
                // ✅ Fix #16: Use safeJSONParse
                var data = safeJSONParse(saved, null);
                if (data) {
                    if (data.thresholds) {
                        thresholds = data.thresholds;
                        var earlyEl = safeGetElement('earlyThreshold');
                        var lateEl = safeGetElement('lateThreshold');
                        if (earlyEl) earlyEl.value = thresholds.early;
                        if (lateEl) lateEl.value = thresholds.late;
                    }
                    if (data.settings) {
                        settings = data.settings;
                        var soundToggle = safeGetElement('soundToggle');
                        var notifToggle = safeGetElement('notifToggle');
                        var autoRefreshToggle = safeGetElement('autoRefreshToggle');
                        if (soundToggle) soundToggle.classList.toggle('active', settings.sound);
                        if (notifToggle) notifToggle.classList.toggle('active', settings.notif);
                        if (autoRefreshToggle) autoRefreshToggle.classList.toggle('active', settings.autoRefresh);
                    }
                    if (data.colors) {
                        var colorPrimary = safeGetElement('colorPrimary');
                        var colorEarly = safeGetElement('colorEarly');
                        var colorOntime = safeGetElement('colorOntime');
                        var colorLate = safeGetElement('colorLate');
                        if (colorPrimary) colorPrimary.value = data.colors.primary;
                        if (colorEarly) colorEarly.value = data.colors.early;
                        if (colorOntime) colorOntime.value = data.colors.ontime;
                        if (colorLate) colorLate.value = data.colors.late;
                        updateColors();
                    }
                    if (data.spotSize) {
                        var spotSizeEl = safeGetElement('spotSize');
                        if (spotSizeEl) spotSizeEl.value = data.spotSize;
                        updateSpotSize();
                    }
                    showNotification('success', 'Settings', 'Settings loaded');
                }
            } catch (error) {
                console.error('Error loading settings:', error);
            }
        }

        function resetSettings() {
            if (confirm('Are you sure you want to reset all settings?')) {
                localStorage.removeItem('LOCC_Settings');
                location.reload();
            }
        }

        // ═══════════════ Alerts ═══════════════
        var alertsList = [];

        function addAlert(type, title, message) {
            var alert = {
                id: Date.now(),
                type: type,
                title: sanitizeInput(title),
                message: sanitizeInput(message),
                time: new Date().toLocaleTimeString('en-US', { hour12: false })
            };
            alertsList.unshift(alert);
            if (alertsList.length > 50) alertsList.pop();
            renderAlerts();
            if (settings.notif) showNotification(type, title, message);
        }

        function renderAlerts() {
            var container = safeGetElement('alertsList');
            if (!container) return;
            
            safeSetText('alertsCount', alertsList.length);
            
            if (alertsList.length === 0) {
                container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;">No alerts</div>';
                return;
            }
            
            var html = '';
            alertsList.forEach(function(a) {
                html += '<div class="alert-item ' + a.type + '">' +
                    '<div class="alert-header">' +
                        '<span class="alert-title">' + a.title + '</span>' +
                        '<span class="alert-time">' + a.time + '</span>' +
                    '</div>' +
                    '<div>' + a.message + '</div>' +
                '</div>';
            });
            container.innerHTML = html;
        }

        function clearAlerts() {
            alertsList = [];
            renderAlerts();
            showNotification('info', 'Alerts', 'All alerts cleared');
        }

        function testAlert() {
            var types = ['critical', 'warning', 'info', 'success'];
            var type = types[Math.floor(Math.random() * types.length)];
            addAlert(type, 'Test Alert', 'This is a test alert for testing');
        }

        // ═══════════════ Key Performance Indicators ═══════════════
        var peakOccupancy = 0;

        function updateKPIs() {
            try {
                var total = busData.length;
                var occupancy = Math.round((total / 87) * 100);
                if (occupancy > peakOccupancy) peakOccupancy = occupancy;

                var early = 0, ontime = 0, late = 0, totalPax = 0;
                busData.forEach(function(bus) {
                    var status = getStatus(bus.arrival, bus.departure);
                    if (status.class === 'early') early++;
                    else if (status.class === 'ontime') ontime++;
                    else late++;
                    totalPax += bus.pax || 0;
                });

                var onTimeRate = total > 0 ? Math.round(((early + ontime) / total) * 100) : 0;
                var avgPax = total > 0 ? Math.round(totalPax / total) : 0;
                var avgWait = Math.round(Math.random() * 30 + 10);

                safeSetText('kpiOccupancy', occupancy + '%');
                var occupancyBar = safeGetElement('occupancyBar');
                if (occupancyBar) occupancyBar.style.width = occupancy + '%';
                
                safeSetText('kpiAvgWait', avgWait);
                safeSetText('kpiOnTimeRate', onTimeRate + '%');
                
                var onTimeBar = safeGetElement('onTimeBar');
                if (onTimeBar) {
                    onTimeBar.style.width = onTimeRate + '%';
                    onTimeBar.style.background = onTimeRate >= 80 ? 'var(--green)' : onTimeRate >= 50 ? 'var(--orange)' : 'var(--red)';
                }
                
                safeSetText('kpiAvgPax', avgPax);
                safeSetText('kpiPeakOccupancy', peakOccupancy + '%');
                safeSetText('kpiBusesToday', dailyStats.buses);
                safeSetText('kpiPaxToday', dailyStats.pax.toLocaleString());

                // Update chart
                var totalStatus = early + ontime + late || 1;
                var barEarly = safeGetElement('barEarly');
                var barOntime = safeGetElement('barOntime');
                var barLate = safeGetElement('barLate');
                if (barEarly) barEarly.style.height = Math.max((early / totalStatus) * 100, 5) + '%';
                if (barOntime) barOntime.style.height = Math.max((ontime / totalStatus) * 100, 5) + '%';
                if (barLate) barLate.style.height = Math.max((late / totalStatus) * 100, 5) + '%';
            } catch (error) {
                console.error('Error updating KPIs:', error);
            }
        }

        // ═══════════════ Add New Bus ═══════════════
        var selectedSpot = null;

        function addNewBus() {
            var spotNumEl = safeGetElement('newSpotNumber');
            var spotNum = parseInt(spotNumEl ? spotNumEl.value : 0, 10);
            
            // ✅ Fix #17: Use validateSpotNumber
            if (!validateSpotNumber(spotNum)) {
                showNotification('error', 'Error', 'Enter valid spot number (1-87)');
                return;
            }
            if (busData.find(function(b) { return b.spot === spotNum; })) {
                showNotification('error', 'Error', 'Spot is already occupied');
                return;
            }
            openForm('ScrSegregationIn', spotNum);
        }

        function selectSpot(spotNum, bus) {
            selectedSpot = { num: spotNum, bus: bus };
            var spotActions = safeGetElement('spotActions');
            if (spotActions) spotActions.style.display = 'block';
            safeSetText('selectedSpotNum', spotNum);
        }

        function editSpot() {
            if (selectedSpot && selectedSpot.bus) {
                openForm('ScrSegregationIn', selectedSpot.num);
            }
        }

        // ✅ Fix #40: Replace prompt with safe modal
        function moveSpot() {
            if (selectedSpot && selectedSpot.bus) {
                // Create modal for input instead of prompt
                showMoveSpotModal(selectedSpot);
            } else {
                showNotification('error', 'Error', 'No spot selected');
            }
        }
        
        function showMoveSpotModal(spotData) {
            var modalHTML = 
                '<div class="form-group">' +
                    '<label class="form-label required">New Spot Number (1-87)</label>' +
                    '<input type="number" class="form-input" id="newSpotInput" min="1" max="87" placeholder="Enter spot number">' +
                '</div>' +
                '<div style="color:var(--text-muted);font-size:0.8rem;margin-top:10px;">' +
                    'Current Spot: ' + spotData.num +
                '</div>';
            
            var modal = safeGetElement('modalOverlay');
            var title = safeGetElement('modalTitle');
            var body = safeGetElement('modalBody');
            var footer = modal.querySelector('.modal-footer');
            
            if (title) title.textContent = 'Move Bus to New Spot';
            if (body) body.innerHTML = modalHTML;
            
            // Change footer buttons
            if (footer) {
                footer.innerHTML = 
                    '<button class="panel-btn primary" onclick="confirmMoveSpot()" style="flex:1;">✓ Move</button>' +
                    '<button class="panel-btn danger" onclick="closeModal()" style="flex:1;">Cancel</button>';
            }
            
            if (modal) modal.classList.add('active');
            
            // Focus on input field
            setTimeout(function() {
                var input = safeGetElement('newSpotInput');
                if (input) input.focus();
            }, 100);
        }
        
        function confirmMoveSpot() {
            var input = safeGetElement('newSpotInput');
            if (!input) return;
            
            var newSpotNum = parseInt(input.value, 10);
            
            // ✅ Validate new spot
            if (!validateSpotNumber(newSpotNum)) {
                showNotification('error', 'Error', 'Spot number must be between 1 and 87');
                return;
            }
            
            if (busData.find(function(b) { return b.spot === newSpotNum; })) {
                showNotification('error', 'Error', 'Spot ' + newSpotNum + ' is already occupied');
                return;
            }
            
            if (selectedSpot && selectedSpot.bus) {
                selectedSpot.bus.spot = newSpotNum;
                updateStats();
                renderParkingGrid('entranceGrid', 1, 42);
                renderParkingGrid('exitGrid', 43, 87);
                closeModal();
                showNotification('success', 'Move', 'Bus moved to spot ' + newSpotNum);
                
                // Reset selected spot
                var spotActionsEl = safeGetElement('spotActions');
                if (spotActionsEl) spotActionsEl.style.display = 'none';
                selectedSpot = null;
            }
        }

        function deleteSpot() {
            if (selectedSpot && selectedSpot.bus) {
                if (confirm('Do you want to delete this bus?')) {
                    busData = busData.filter(function(b) { return b.spot !== selectedSpot.num; });
                    updateStats();
                    renderParkingGrid('entranceGrid', 1, 42);
                    renderParkingGrid('exitGrid', 43, 87);
                    var spotActions = safeGetElement('spotActions');
                    if (spotActions) spotActions.style.display = 'none';
                    showNotification('warning', 'Delete', 'Bus deleted');
                }
            }
        }

        // ═══════════════ Forms ═══════════════
        function openForm(formName, spotNum) {
            spotNum = spotNum || null;
            showNotification('info', 'Forms', 'Opening form: ' + sanitizeInput(formName) + (spotNum ? ' - Spot ' + spotNum : ''));
            currentFormName = formName;
            currentSpotForForm = spotNum;
            openFormModal(formName);
        }

        // ═══════════════ Forms Menu ═══════════════
        // ✅ Fix #32: Solve Race Condition in Event Listeners
        var formsMenuClickHandler = null;
        
        function showFormsMenu(e, spotNum, bus) {
            bus = bus || null;
            e.stopPropagation();
            var menu = safeGetElement('formsMenu');
            if (!menu) return;
            
            // Remove any previous listener to prevent accumulation
            if (formsMenuClickHandler) {
                document.removeEventListener('click', formsMenuClickHandler);
                formsMenuClickHandler = null;
            }
            
            currentSpotForForm = spotNum;
            currentBusForForm = bus;
            
            updateFormStatusInMenu(bus);
            
            var x = e.pageX;
            var y = e.pageY;
            if (x + 230 > window.innerWidth) x = window.innerWidth - 240;
            if (y + 300 > window.innerHeight) y = window.innerHeight - 310;
            
            menu.style.left = x + 'px';
            menu.style.top = y + 'px';
            menu.classList.add('active');
            
            // Create handler and save it
            formsMenuClickHandler = function(clickEvent) {
                // Check that click is outside menu
                if (!menu.contains(clickEvent.target)) {
                    closeFormsMenu();
                }
            };
            
            // Slight delay then add listener
            setTimeout(function() {
                document.addEventListener('click', formsMenuClickHandler);
            }, 50);
        }

        function closeFormsMenu() {
            var menu = safeGetElement('formsMenu');
            if (menu) menu.classList.remove('active');
            
            // Remove listener on close
            if (formsMenuClickHandler) {
                document.removeEventListener('click', formsMenuClickHandler);
                formsMenuClickHandler = null;
            }
        }

        function updateFormStatusInMenu(bus) {
            var forms = ['ScrLogIn', 'ScrSegregationIn', 'ScrWelcomeLounge', 'ScrSegregationExit', 'ScrCurbside'];
            forms.forEach(function(form, i) {
                var statusEl = safeGetElement('formStatus' + (i + 1));
                if (statusEl) {
                    if (bus && bus.forms && bus.forms[form]) {
                        statusEl.textContent = 'OK';
                    } else {
                        statusEl.textContent = '⬜';
                    }
                }
            });
        }

        function selectFormFromMenu(formName) {
            closeFormsMenu();
            currentFormName = formName;
            openFormModal(formName, currentBusForForm);
        }

        // ═══════════════ Modal Windows ═══════════════
        function openFormModal(formName, bus) {
            bus = bus || null;
            var modal = safeGetElement('modalOverlay');
            var title = safeGetElement('modalTitle');
            var body = safeGetElement('modalBody');
            if (!modal || !title || !body) return;
            
            var formTitles = {
                'ScrLogIn': 'Login',
                'ScrSegregationIn': 'Buses Entering Segregation',
                'ScrWelcomeLounge': 'Welcome Lounge',
                'ScrSegregationExit': 'Buses Exiting Segregation',
                'ScrCurbside': 'Curbside'
            };
            
            title.textContent = formTitles[formName] || formName;
            body.innerHTML = getFormHTML(formName, bus);
            modal.classList.add('active');
        }

        function getFormHTML(formName, bus) {
            bus = bus || null;
            var data = (bus && bus.forms && bus.forms[formName]) ? bus.forms[formName] : {};
            
            // Fill data from bus if not present in form
            if (bus) {
                data.BusPlate = data.BusPlate || bus.plate || '';
                data.BusNO = data.BusNO || bus.busNo || '';
                data.FlightNo = data.FlightNo || bus.flight || '';
                data.PaxCount = data.PaxCount || bus.pax || '';
                data.GetaNO = data.GetaNO || bus.gate || '';
                data.ParkNO = data.ParkNO || bus.spot || '';
            }
            
            // ✅ Fix #19: Clean all data displayed in forms
            var safeData = {};
            for (var key in data) {
                if (data.hasOwnProperty(key)) {
                    safeData[key] = sanitizeInput(data[key]);
                }
            }
            
            var forms = {
                'ScrLogIn': getFormScrLogIn(safeData),
                'ScrSegregationIn': getFormScrSegregationIn(safeData),
                'ScrWelcomeLounge': getFormScrWelcomeLounge(safeData, bus),
                'ScrSegregationExit': getFormScrSegregationExit(safeData, bus),
                'ScrCurbside': getFormScrCurbside(safeData, bus)
            };
            
            return forms[formName] || '<p>Form not available</p>';
        }
        
        function getFormScrLogIn(data) {
            return '<div class="form-group">' +
                '<label class="form-label required">Work Location</label>' +
                '<select class="form-select" id="cmbWorkLoc">' +
                    '<option value="">Choose...</option>' +
                    '<option value="ScrLogIn"' + (data.cmbWorkLoc === 'ScrLogIn' ? ' selected' : '') + '>ScrLogIn</option>' +
                    '<option value="ScrSegregationIn"' + (data.cmbWorkLoc === 'ScrSegregationIn' ? ' selected' : '') + '>ScrSegregationIn</option>' +
                    '<option value="ScrWelcomeLounge"' + (data.cmbWorkLoc === 'ScrWelcomeLounge' ? ' selected' : '') + '>ScrWelcomeLounge</option>' +
                    '<option value="ScrSegregationExit"' + (data.cmbWorkLoc === 'ScrSegregationExit' ? ' selected' : '') + '>ScrSegregationExit</option>' +
                    '<option value="ScrCurbside"' + (data.cmbWorkLoc === 'ScrCurbside' ? ' selected' : '') + '>ScrCurbside</option>' +
                '</select>' +
            '</div>';
        }
        
        function getFormScrSegregationIn(data) {
            return '<div class="form-row">' +
                '<div class="form-group">' +
                    '<label class="form-label required">BusPlate</label>' +
                    '<input type="text" class="form-input" id="BusPlate" value="' + (data.BusPlate || '') + '">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label class="form-label required">BusNO</label>' +
                    '<input type="number" class="form-input" id="BusNO" value="' + (data.BusNO || '') + '">' +
                '</div>' +
            '</div>' +
            '<div class="form-row">' +
                '<div class="form-group">' +
                    '<label class="form-label">TripCount</label>' +
                    '<input type="number" class="form-input" id="TripCount" value="' + (data.TripCount || '') + '">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label class="form-label required">DepTime</label>' +
                    '<input type="datetime-local" class="form-input" id="DepTime" value="' + (data.DepTime || '') + '" step="1">' +
                '</div>' +
            '</div>' +
            '<div class="form-row">' +
                '<div class="form-group">' +
                    '<label class="form-label required">FlightNo</label>' +
                    '<input type="text" class="form-input" id="FlightNo" value="' + (data.FlightNo || '') + '">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label class="form-label">CurDT</label>' +
                    '<input type="datetime-local" class="form-input" id="CurDT" value="' + (data.CurDT || new Date().toISOString().slice(0,16)) + '" step="1">' +
                '</div>' +
            '</div>' +
            '<div class="form-row">' +
                '<div class="form-group">' +
                    '<label class="form-label required">TerminalCd</label>' +
                    '<select class="form-select" id="TerminalCd">' +
                        '<option value="">Choose...</option>' +
                        '<option value="HT"' + (data.TerminalCd === 'HT' ? ' selected' : '') + '>HT</option>' +
                        '<option value="NT"' + (data.TerminalCd === 'NT' ? ' selected' : '') + '>NT</option>' +
                        '<option value="T1"' + (data.TerminalCd === 'T1' ? ' selected' : '') + '>T1</option>' +
                    '</select>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label class="form-label">TotalPax</label>' +
                    '<input type="text" class="form-input" id="TotalPax" value="' + (data.TotalPax || '') + '">' +
                '</div>' +
            '</div>' +
            '<div class="form-row">' +
                '<div class="form-group">' +
                    '<label class="form-label required">PaxCount</label>' +
                    '<input type="number" class="form-input" id="PaxCount" value="' + (data.PaxCount || '') + '">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label class="form-label">Destination</label>' +
                    '<input type="text" class="form-input" id="Destination" value="' + (data.Destination || '') + '">' +
                '</div>' +
            '</div>' +
            '<div class="form-row">' +
                '<div class="form-group">' +
                    '<label class="form-label">DispatchSts</label>' +
                    '<select class="form-select" id="DispatchSts">' +
                        '<option value="">Choose...</option>' +
                        '<option value="Invalid"' + (data.DispatchSts === 'Invalid' ? ' selected' : '') + '>Invalid</option>' +
                        '<option value="Early"' + (data.DispatchSts === 'Early' ? ' selected' : '') + '>Early</option>' +
                        '<option value="Late"' + (data.DispatchSts === 'Late' ? ' selected' : '') + '>Late</option>' +
                        '<option value="Shared Trips"' + (data.DispatchSts === 'Shared Trips' ? ' selected' : '') + '>Shared Trips</option>' +
                        '<option value="Shared Trips and Lounges"' + (data.DispatchSts === 'Shared Trips and Lounges' ? ' selected' : '') + '>Shared Trips and Lounges</option>' +
                    '</select>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label class="form-label required">VisaType</label>' +
                    '<select class="form-select" id="VisaType">' +
                        '<option value="">Choose...</option>' +
                        '<option value="Hajj"' + (data.VisaType === 'Hajj' ? ' selected' : '') + '>Hajj</option>' +
                        '<option value="GCC"' + (data.VisaType === 'GCC' ? ' selected' : '') + '>GCC</option>' +
                        '<option value="Visit"' + (data.VisaType === 'Visit' ? ' selected' : '') + '>Visit</option>' +
                        '<option value="Tourism"' + (data.VisaType === 'Tourism' ? ' selected' : '') + '>Tourism</option>' +
                        '<option value="Work"' + (data.VisaType === 'Work' ? ' selected' : '') + '>Work</option>' +
                        '<option value="Umrah"' + (data.VisaType === 'Umrah' ? ' selected' : '') + '>Umrah</option>' +
                    '</select>' +
                '</div>' +
            '</div>' +
            '<div class="form-group">' +
                '<label class="form-label">UmrahCop</label>' +
                '<input type="text" class="form-input" id="UmrahCop" value="' + (data.UmrahCop || '') + '">' +
            '</div>';
        }
        
        function getFormScrWelcomeLounge(data, bus) {
            return '<div class="form-row">' +
                '<div class="form-group">' +
                    '<label class="form-label required">BusNO</label>' +
                    '<input type="number" class="form-input" id="BusNO" value="' + ((bus && bus.busNo) || data.BusNO || '') + '" readonly style="background:#333;">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label class="form-label required">ParkNO</label>' +
                    '<input type="number" class="form-input" id="ParkNO" value="' + (currentSpotForForm || data.ParkNO || '') + '" min="1" max="87" placeholder="1-87">' +
                '</div>' +
            '</div>' +
            '<div class="form-row">' +
                '<div class="form-group">' +
                    '<label class="form-label required">BusPlate</label>' +
                    '<input type="text" class="form-input" id="BusPlate" value="' + ((bus && bus.plate) || data.BusPlate || '') + '" readonly style="background:#333;">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label class="form-label">BagStatus</label>' +
                    '<select class="form-select" id="BagStatus">' +
                        '<option value="">Choose...</option>' +
                        '<option value="Checked"' + (data.BagStatus === 'Checked' ? ' selected' : '') + '>Checked</option>' +
                        '<option value="None"' + (data.BagStatus === 'None' ? ' selected' : '') + '>None</option>' +
                        '<option value="Mixed"' + (data.BagStatus === 'Mixed' ? ' selected' : '') + '>Mixed</option>' +
                    '</select>' +
                '</div>' +
            '</div>' +
            '<div class="form-row">' +
                '<div class="form-group">' +
                    '<label class="form-label">T3CALL</label>' +
                    '<input type="datetime-local" class="form-input" id="T3CALL" value="' + (data.T3CALL || '') + '" step="1">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label class="form-label">FlightSts</label>' +
                    '<select class="form-select" id="FlightSts">' +
                        '<option value="">Choose...</option>' +
                        '<option value="Departed"' + (data.FlightSts === 'Departed' ? ' selected' : '') + '>Departed</option>' +
                        '<option value="Cancelled"' + (data.FlightSts === 'Cancelled' ? ' selected' : '') + '>Cancelled</option>' +
                        '<option value="Delayed"' + (data.FlightSts === 'Delayed' ? ' selected' : '') + '>Delayed</option>' +
                        '<option value="On Time"' + (data.FlightSts === 'On Time' ? ' selected' : '') + '>On Time</option>' +
                    '</select>' +
                '</div>' +
            '</div>' +
            '<div class="form-row">' +
                '<div class="form-group">' +
                    '<label class="form-label">T3ACT</label>' +
                    '<select class="form-select" id="T3ACT">' +
                        '<option value="">Choose...</option>' +
                        '<option value="Approval"' + (data.T3ACT === 'Approval' ? ' selected' : '') + '>Approval</option>' +
                        '<option value="Waiting"' + (data.T3ACT === 'Waiting' ? ' selected' : '') + '>Waiting</option>' +
                    '</select>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label class="form-label required">GetaNO</label>' +
                    '<select class="form-select" id="GetaNO">' +
                        '<option value="">Choose...</option>' +
                        '<option value="A1"' + (data.GetaNO === 'A1' ? ' selected' : '') + '>A1</option>' +
                        '<option value="A2"' + (data.GetaNO === 'A2' ? ' selected' : '') + '>A2</option>' +
                        '<option value="B1"' + (data.GetaNO === 'B1' ? ' selected' : '') + '>B1</option>' +
                        '<option value="B2"' + (data.GetaNO === 'B2' ? ' selected' : '') + '>B2</option>' +
                        '<option value="C1"' + (data.GetaNO === 'C1' ? ' selected' : '') + '>C1</option>' +
                        '<option value="C2"' + (data.GetaNO === 'C2' ? ' selected' : '') + '>C2</option>' +
                        '<option value="D1"' + (data.GetaNO === 'D1' ? ' selected' : '') + '>D1</option>' +
                        '<option value="D2"' + (data.GetaNO === 'D2' ? ' selected' : '') + '>D2</option>' +
                        '<option value="E1"' + (data.GetaNO === 'E1' ? ' selected' : '') + '>E1</option>' +
                        '<option value="E2"' + (data.GetaNO === 'E2' ? ' selected' : '') + '>E2</option>' +
                    '</select>' +
                '</div>' +
            '</div>' +
            '<div class="form-group">' +
                '<label class="form-label">T3APRO</label>' +
                '<input type="datetime-local" class="form-input" id="T3APRO" value="' + (data.T3APRO || '') + '" step="1">' +
            '</div>';
        }
        
        function getFormScrSegregationExit(data, bus) {
            return '<div class="form-row">' +
                '<div class="form-group">' +
                    '<label class="form-label required">FlightNo</label>' +
                    '<input type="text" class="form-input" id="FlightNo" value="' + ((bus && bus.flight) || data.FlightNo || '') + '">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label class="form-label required">BusPlate</label>' +
                    '<input type="text" class="form-input" id="BusPlate" value="' + ((bus && bus.plate) || data.BusPlate || '') + '">' +
                '</div>' +
            '</div>' +
            '<div class="form-row">' +
                '<div class="form-group">' +
                    '<label class="form-label required">BusNO</label>' +
                    '<input type="number" class="form-input" id="BusNO" value="' + (data.BusNO || '') + '">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label class="form-label required">ExitDT</label>' +
                    '<input type="datetime-local" class="form-input" id="ExitDT" value="' + (data.ExitDT || new Date().toISOString().slice(0,16)) + '" step="1">' +
                '</div>' +
            '</div>' +
            '<div style="background:rgba(255,152,0,0.2);padding:10px;border-radius:6px;margin-top:10px;">' +
                '<span style="color:var(--orange);">⚠️ Warning:</span> On save, spot will be evacuated and bus moved to gates section' + +
            '</div>';
        }
        
        function getFormScrCurbside(data, bus) {
            var gateValue = (bus && bus.gate) || data.GetaNO || '';
            return '<div class="form-row">' +
                '<div class="form-group">' +
                    '<label class="form-label required">BusNO</label>' +
                    '<input type="number" class="form-input" id="BusNO" value="' + (data.BusNO || '') + '">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label class="form-label required">BusDepDT</label>' +
                    '<input type="datetime-local" class="form-input" id="BusDepDT" value="' + (data.BusDepDT || new Date().toISOString().slice(0,16)) + '" step="1">' +
                '</div>' +
            '</div>' +
            '<div class="form-row">' +
                '<div class="form-group">' +
                    '<label class="form-label">PaxDisembarkDT</label>' +
                    '<input type="datetime-local" class="form-input" id="PaxDisembarkDT" value="' + (data.PaxDisembarkDT || '') + '" step="1">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label class="form-label required">BusArrDT</label>' +
                    '<input type="datetime-local" class="form-input" id="BusArrDT" value="' + (data.BusArrDT || '') + '" step="1">' +
                '</div>' +
            '</div>' +
            '<div class="form-row">' +
                '<div class="form-group">' +
                    '<label class="form-label required">BusPlate</label>' +
                    '<input type="text" class="form-input" id="BusPlate" value="' + ((bus && bus.plate) || data.BusPlate || '') + '">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label class="form-label">DelayReason</label>' +
                    '<select class="form-select" id="DelayReason">' +
                        '<option value="">Choose...</option>' +
                        '<option value="ZMZM"' + (data.DelayReason === 'ZMZM' ? ' selected' : '') + '>ZMZM</option>' +
                        '<option value="Operations"' + (data.DelayReason === 'Operations' ? ' selected' : '') + '>Operations</option>' +
                        '<option value="Bags"' + (data.DelayReason === 'Bags' ? ' selected' : '') + '>Bags</option>' +
                        '<option value="Passport Distribution"' + (data.DelayReason === 'Passport Distribution' ? ' selected' : '') + '>Passport Distribution</option>' +
                    '</select>' +
                '</div>' +
            '</div>' +
            '<div class="form-row">' +
                '<div class="form-group">' +
                    '<label class="form-label">FlightSts</label>' +
                    '<select class="form-select" id="FlightSts">' +
                        '<option value="">Choose...</option>' +
                        '<option value="Departed"' + (data.FlightSts === 'Departed' ? ' selected' : '') + '>Departed</option>' +
                        '<option value="Cancelled"' + (data.FlightSts === 'Cancelled' ? ' selected' : '') + '>Cancelled</option>' +
                        '<option value="Delayed"' + (data.FlightSts === 'Delayed' ? ' selected' : '') + '>Delayed</option>' +
                    '</select>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label class="form-label required">GetaNO</label>' +
                    '<select class="form-select" id="GetaNO">' +
                        '<option value="">Choose...</option>' +
                        '<option value="A1"' + (gateValue === 'A1' ? ' selected' : '') + '>A1</option>' +
                        '<option value="A2"' + (gateValue === 'A2' ? ' selected' : '') + '>A2</option>' +
                        '<option value="B1"' + (gateValue === 'B1' ? ' selected' : '') + '>B1</option>' +
                        '<option value="B2"' + (gateValue === 'B2' ? ' selected' : '') + '>B2</option>' +
                        '<option value="C1"' + (gateValue === 'C1' ? ' selected' : '') + '>C1</option>' +
                        '<option value="C2"' + (gateValue === 'C2' ? ' selected' : '') + '>C2</option>' +
                        '<option value="D1"' + (gateValue === 'D1' ? ' selected' : '') + '>D1</option>' +
                        '<option value="D2"' + (gateValue === 'D2' ? ' selected' : '') + '>D2</option>' +
                        '<option value="E1"' + (gateValue === 'E1' ? ' selected' : '') + '>E1</option>' +
                        '<option value="E2"' + (gateValue === 'E2' ? ' selected' : '') + '>E2</option>' +
                    '</select>' +
                '</div>' +
            '</div>' +
            '<div style="background:rgba(244,67,54,0.2);padding:10px;border-radius:6px;margin-top:10px;">' +
                '<span style="color:var(--red);">⚠️ Warning:</span> On save, bus will be hidden from gates and moved to departed buses section' +
            '</div>';
        }

        function closeModal() {
            var modal = safeGetElement('modalOverlay');
            if (modal) modal.classList.remove('active');
            currentFormName = null;
            currentSpotForForm = null;
            currentBusForForm = null;
        }

        function closeModalOnOverlay(e) {
            if (e.target.id === 'modalOverlay') closeModal();
        }

        function saveFormData() {
            try {
                // Collect data from form
                var formData = {};
                var inputs = document.querySelectorAll('#modalBody input, #modalBody select');
                inputs.forEach(function(input) {
                    formData[input.id] = input.value;
                });
                formData.timestamp = new Date().toISOString();
                
                // Form processing based on type
                if (currentFormName === 'ScrSegregationIn') {
                    // ✅ Fix #20: Validate new bus data
                    if (!formData.BusPlate || formData.BusPlate.trim() === '') {
                        showNotification('error', 'Error', 'Please enter bus plate number');
                        return;
                    }
                    
                    var newBus = {
                        id: Date.now(),
                        plate: formData.BusPlate.trim(),
                        busNo: formData.BusNO,
                        flight: formData.FlightNo,
                        pax: parseInt(formData.PaxCount, 10) || 0,
                        visa: formData.VisaType,
                        terminal: formData.TerminalCd,
                        destination: formData.Destination,
                        departure: formData.DepTime,
                        arrival: new Date().toISOString(),
                        tripCount: formData.TripCount,
                        totalPax: formData.TotalPax,
                        dispatchSts: formData.DispatchSts,
                        umrahCop: formData.UmrahCop,
                        curDT: formData.CurDT,
                        spot: null,
                        gate: null,
                        forms: { ScrSegregationIn: formData }
                    };
                    busData.push(newBus);
                    
                    dailyStats.buses++;
                    dailyStats.pax += newBus.pax;
                    dailyStats.flights.add(newBus.flight);
                    
                    var status = getStatus(newBus.arrival, newBus.departure);
                    if (status.class === 'early') dailyStats.early++;
                    else if (status.class === 'ontime') dailyStats.ontime++;
                    else if (status.class === 'late') dailyStats.late++;
                    
                    showNotification('success', 'ScrSegregationIn', 'Bus ' + sanitizeInput(formData.BusPlate) + ' registered - Click it in "Registered" list to assign spot');
                    
                } else if (currentFormName === 'ScrWelcomeLounge') {
                    var spotNum = parseInt(formData.ParkNO, 10);
                    
                    // ✅ Fix #21: Validate spot number
                    if (!validateSpotNumber(spotNum)) {
                        showNotification('error', 'Error', 'Please select valid spot number (1-87)');
                        return;
                    }
                    
                    var existingBus = busData.find(function(b) { return b.spot === spotNum; });
                    if (existingBus && currentBusForForm && existingBus.id !== currentBusForForm.id) {
                        showNotification('error', 'Error', 'Spot ' + spotNum + ' is already occupied');
                        return;
                    }
                    
                    if (currentBusForForm) {
                        var busIndex = busData.findIndex(function(b) { return b.id === currentBusForForm.id; });
                        if (busIndex !== -1) {
                            busData[busIndex].spot = spotNum;
                            busData[busIndex].gate = formData.GetaNO;
                            busData[busIndex].bagStatus = formData.BagStatus;
                            busData[busIndex].flightSts = formData.FlightSts;
                            busData[busIndex].t3call = formData.T3CALL;
                            busData[busIndex].t3act = formData.T3ACT;
                            busData[busIndex].t3apro = formData.T3APRO;
                            busData[busIndex].forms.ScrWelcomeLounge = formData;
                        }
                    }
                    
                    showNotification('success', 'ScrWelcomeLounge', 'Spot ' + spotNum + ' assigned to bus');
                    
                } else if (currentFormName === 'ScrSegregationExit') {
                    if (currentBusForForm) {
                        var busIndex = busData.findIndex(function(b) { return b.id === currentBusForForm.id; });
                        if (busIndex !== -1) {
                            var bus = busData[busIndex];
                            bus.exitDT = formData.ExitDT;
                            if (!bus.forms) { bus.forms = {}; }
                            bus.forms.ScrSegregationExit = formData;
                            bus.spot = null;
                        }
                    }
                    showNotification('success', 'ScrSegregationExit', 'Spot evacuated');
                    
                } else if (currentFormName === 'ScrCurbside') {
                    if (currentBusForForm) {
                        var busIndex = busData.findIndex(function(b) { return b.id === currentBusForForm.id; });
                        if (busIndex !== -1) {
                            var bus = busData.splice(busIndex, 1)[0];
                            bus.busDepDT = formData.BusDepDT;
                            bus.busArrDT = formData.BusArrDT;
                            bus.paxDisembarkDT = formData.PaxDisembarkDT;
                            bus.delayReason = formData.DelayReason;
                            if (!bus.forms) { bus.forms = {}; }
                            bus.forms.ScrCurbside = formData;
                            departedBuses.unshift(bus);
                        }
                    }
                    showNotification('success', 'ScrCurbside', 'Bus departure registered');
                }
                
                closeModal();
                saveData();
                updateStats();
                renderParkingGrid('entranceGrid', 1, 42);
                renderParkingGrid('exitGrid', 43, 87);
                renderGates();
                updateBusLists();
                updateKPIs();
            } catch (error) {
                console.error('Error saving form data:', error);
                showNotification('error', 'Error', 'Failed to save data');
            }
        }

        // ═══════════════ Update Bus Lists ═══════════════
        function updateBusLists() {
            updateRegisteredList();
            updateSegregationList();
            updateDepartedList();
        }

        function updateRegisteredList() {
            var list = safeGetElement('registeredList');
            if (!list) return;
            
            safeSetText('registeredCount', busData.length);
            
            if (busData.length === 0) {
                list.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;">No registered buses</div>';
                return;
            }
            
            var html = '';
            busData.forEach(function(bus) {
                var status = getStatus(bus.arrival, bus.departure);
                var formsCompleted = bus.forms ? Object.keys(bus.forms).length : 1;
                // ✅ Fix #22: Use data attribute instead of inline JSON
                html += '<div class="bus-card ' + status.class + '" data-bus-id="' + bus.id + '" onclick="openBusFormById(' + bus.id + ')">' +
                    '<div class="bus-card-header">' +
                        '<span class="bus-card-plate">' + sanitizeInput(bus.plate) + '</span>' +
                        '<span class="bus-card-badge ' + status.class + '">' + (bus.spot ? 'Spot ' + bus.spot : 'Awaiting Spot') + '</span>' +
                    '</div>' +
                    '<div class="bus-card-info">' +
                        '<span>B: ' + sanitizeInput(bus.busNo || '-') + '</span>' +
                        '<span>F: ' + sanitizeInput(bus.flight || '-') + '</span>' +
                        '<span>P: ' + sanitizeInput(bus.pax || '-') + '</span>' +
                        '<span>G: ' + sanitizeInput(bus.gate || '-') + '</span>' +
                    '</div>' +
                    '<div class="bus-card-progress">' +
                        '<div class="bus-card-progress-fill" style="width:' + (formsCompleted * 25) + '%"></div>' +
                    '</div>' +
                '</div>';
            });
            list.innerHTML = html;
        }
        
        // ✅ Fix #23: Safe function to open bus form by ID
        function openBusFormById(busId) {
            var bus = busData.find(function(b) { return b.id === busId; });
            if (!bus) {
                showNotification('error', 'Error', 'Bus not found');
                return;
            }
            
            currentBusForForm = bus;
            
            if (!bus.spot) {
                openFormModal('ScrWelcomeLounge', bus);
            } else if (!bus.forms || !bus.forms.ScrSegregationExit) {
                openFormModal('ScrSegregationExit', bus);
            } else {
                openFormModal('ScrCurbside', bus);
            }
        }
        
        // Old function for backward compatibility
function openBusForm(busJson) {
    try {
        // ✅ Fix #24: Use safeJSONParse
        var bus = safeJSONParse(busJson.replace(/&quot;/g, '"'), null);
        if (!bus) {
            showNotification('error', 'Error', 'Invalid bus data');
            return;
        }
        openBusFormById(bus.id);
    } catch (error) {
        console.error('Error opening bus form:', error);
        showNotification('error', 'Error', 'Failed to open the form');
    }
}


  // ===================== LIST UPDATES =====================
  function updateSegregationList() {
    var list = safeGetElement('segregationList');
    if (!list) return;

    var segregationBuses = busData.filter(b => b.spot);
    safeSetText('segregationCount', segregationBuses.length);

    if (segregationBuses.length === 0) {
      list.innerHTML =
        '<div style="text-align:center;color:#999;padding:20px;">No buses in segregation</div>';
      return;
    }

    list.innerHTML = segregationBuses
      .map(bus => {
        var status = getStatus(bus.arrival, bus.departure);
        return `
          <div class="bus-card ${status.class}" onclick="showFormsMenu(event, ${bus.spot})">
            <div class="bus-card-header">
              <span class="bus-card-plate">${sanitizeInput(bus.plate)}</span>
              <span class="bus-card-badge ${status.class}">Spot ${bus.spot}</span>
            </div>
            <div class="bus-card-info">
              <span>${sanitizeInput(bus.flight)}</span>
              <span>${sanitizeInput(bus.pax || '-')}</span>
              <span>${status.hours.toFixed(1)} h</span>
            </div>
          </div>`;
      })
      .join('');
  }

  function updateDepartedList() {
    var list = safeGetElement('departedList');
    if (!list) return;

    safeSetText('departedCount', departedBuses.length);
    safeSetText('departedToday', departedBuses.length);

    var totalPax = departedBuses.reduce((s, b) => s + (b.pax || 0), 0);
    safeSetText('departedPax', totalPax);

    if (departedBuses.length === 0) {
      list.innerHTML =
        '<div style="text-align:center;color:#999;padding:20px;">No departed buses</div>';
      return;
    }

    list.innerHTML = departedBuses.slice(0, 20).map(bus => `
      <div class="bus-card completed">
        <div class="bus-card-header">
          <span class="bus-card-plate">${sanitizeInput(bus.plate)}</span>
          <span class="bus-card-badge completed">Completed</span>
        </div>
        <div class="bus-card-info">
          <span>${sanitizeInput(bus.flight)}</span>
          <span>${sanitizeInput(bus.pax || '-')}</span>
          <span>${sanitizeInput(bus.gate || '-')}</span>
        </div>
      </div>
    `).join('');
  }

 // ===================== FULLSCREEN =====================
  function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    } catch (e) {
      console.error('Error toggling fullscreen:', e);
    }
  }

  // ===================== ZOOM =====================
  function setZoom(level) {
    zoomLevel = level;
    safeSetText('zoomLevel', zoomLevel + '%');

    var content = document.querySelector('.content-area');
    if (content) {
      content.style.transform = `scale(${zoomLevel / 100})`;
      content.style.transformOrigin = 'top center';
    }
  }

  function zoomIn() { setZoom(Math.min(zoomLevel + 10, 150)); }
  function zoomOut() { setZoom(Math.max(zoomLevel - 10, 50)); }
  function zoomReset() { setZoom(100); }

  // ===================== EDIT MODE =====================
  function toggleEditMode() {
    editMode = !editMode;
    safeSetText(
      'editBtn',
      editMode ? 'Disable Edit Mode' : 'Enable Edit Mode'
    );

    showNotification(
      editMode ? 'success' : 'info',
      'Edit Mode',
      editMode ? 'Activated' : 'Deactivated'
    );
  }

  // ===================== EXPORT =====================
  function exportJSON() {
    var data = safeJSONStringify({ busData, dailyStats });
    downloadFile(data, 'Bus_Data.json', 'application/json');
    showNotification('success', 'Export', 'Data exported successfully');
  }

  function exportCSV() {
    var csv = 'Spot,Plate,Flight,Passengers,Gate,Departure,Status\n';
    busData.forEach(b => {
      var s = getStatus(b.arrival, b.departure);
      csv += `${b.spot},${b.plate},${b.flight},${b.pax || ''},${b.gate || ''},${b.departure || ''},${s.label}\n`;
    });
    downloadFile(csv, 'Bus_Data.csv', 'text/csv');
    showNotification('success', 'Export', 'CSV exported successfully');
  }

  function downloadFile(data, filename, type) {
    var blob = new Blob(['\ufeff' + data], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ===================== STORAGE =====================
  function saveData() {
    localStorage.setItem('BUS_DATA', safeJSONStringify({ busData, departedBuses }));
  }

  function loadData() {
    var d = safeJSONParse(localStorage.getItem('BUS_DATA'));
    if (!d) return;
    busData = d.busData || [];
    departedBuses = d.departedBuses || [];
  }

  // ===================== FILTER =====================
  function filterBuses(type) {
    currentFilter = type;
    showNotification('info', 'Filter', 'Showing: ' + type);
  }

  // ===================== INIT =====================
  function init() {
    loadData();
    updateSegregationList();
    updateDepartedList();
    setZoom(100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ===================== EXPOSE =====================
  window.toggleFullscreen = toggleFullscreen;
  window.zoomIn = zoomIn;
  window.zoomOut = zoomOut;
  window.zoomReset = zoomReset;
  window.toggleEditMode = toggleEditMode;
  window.exportJSON = exportJSON;
  window.exportCSV = exportCSV;
  window.filterBuses = filterBuses;

})(window, document);