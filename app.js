/* ===================================
   CONFIGURATION
   =================================== */
const CONFIG = {
    // Update this URL after deploying your Google Apps Script
    BASE_URL: 'YOUR_APPS_SCRIPT_WEB_APP_URL_HERE',
    SPREADSHEET_ID: '1NAnpwv3hBYvyo1TOdLhUzIMT-ZpkzUm0m1T8MBQRbtY',
    TIMEZONE: 'Asia/Dhaka',
    DEFAULT_QUOTAS: {
        Annual: 15,
        Casual: 10,
        Sick: 14
    },
    ITEMS_PER_PAGE: 20
};

/* ===================================
   STATE MANAGEMENT
   =================================== */
const state = {
    employees: [],
    currentEmployeeId: null,
    currentEmployee: null,
    currentYear: new Date().getFullYear(),
    attendanceRecords: [],
    filteredAttendanceRecords: [],
    leaveQuotas: {},
    leaveUsage: {},
    currentPage: 1,
    sortColumn: 'date',
    sortDirection: 'desc',
    filters: {
        dateFrom: null,
        dateTo: null,
        wfh: '',
        leaveType: '',
        minHours: '',
        maxHours: ''
    }
};

/* ===================================
   UTILITY FUNCTIONS
   =================================== */

// Date utilities for Asia/Dhaka timezone
const DateUtils = {
    // Get current date/time in Asia/Dhaka timezone
    getCurrentDhakaDate() {
        return new Date(new Date().toLocaleString('en-US', { timeZone: CONFIG.TIMEZONE }));
    },
    
    formatDate(date, format = 'yyyy-mm-dd') {
        const d = typeof date === 'string' ? new Date(date) : date;
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        
        if (format === 'yyyy-mm-dd') {
            return `${year}-${month}-${day}`;
        } else if (format === 'dd/mm/yyyy') {
            return `${day}/${month}/${year}`;
        }
        return `${year}-${month}-${day}`;
    },
    
    formatTime(time24) {
        if (!time24) return '--:--';
        const [hours, minutes] = time24.split(':');
        return `${hours}:${minutes}`;
    },
    
    // Calculate hours between two times, handling overnight shifts
    calculateHours(clockIn, clockOut, breakMinutes = 0) {
        if (!clockIn || !clockOut) return 0;
        
        const [inHours, inMinutes] = clockIn.split(':').map(Number);
        const [outHours, outMinutes] = clockOut.split(':').map(Number);
        
        let inTotalMinutes = inHours * 60 + inMinutes;
        let outTotalMinutes = outHours * 60 + outMinutes;
        
        // Handle overnight shift (clock out is earlier than clock in)
        if (outTotalMinutes <= inTotalMinutes) {
            outTotalMinutes += 24 * 60; // Add 24 hours
        }
        
        const totalMinutes = outTotalMinutes - inTotalMinutes - breakMinutes;
        return Math.max(0, totalMinutes / 60);
    },
    
    isValidTime(time) {
        const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        return regex.test(time);
    },
    
    getTodayString() {
        return this.formatDate(this.getCurrentDhakaDate());
    },
    
    getYearStartDate(year) {
        return `${year}-01-01`;
    }
};

// API helper functions
const API = {
    async request(endpoint, method = 'GET', data = null) {
        const url = `${CONFIG.BASE_URL}${endpoint}`;
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        if (data) {
            if (method === 'GET') {
                const params = new URLSearchParams(data);
                return fetch(`${url}?${params}`, { method });
            } else {
                options.body = JSON.stringify(data);
            }
        }
        
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    },
    
    // Employee endpoints
    async getEmployees() {
        return await this.request('/employees');
    },
    
    // Attendance endpoints
    async getAttendance(employeeId, from = null, to = null) {
        const params = { employeeId };
        if (from) params.from = from;
        if (to) params.to = to;
        return await this.request('/attendance', 'GET', params);
    },
    
    async saveAttendance(data) {
        return await this.request('/attendance', 'POST', data);
    },
    
    async deleteAttendance(date, employeeId) {
        return await this.request('/attendance/delete', 'POST', { date, employeeId });
    },
    
    // Leave endpoints
    async getLeaveQuotas(year) {
        return await this.request('/leave/quotas', 'GET', { year });
    },
    
    async getLeaveUsage(employeeId, year) {
        return await this.request('/leave/usage', 'GET', { employeeId, year });
    },
    
    async requestLeave(data) {
        return await this.request('/leave/request', 'POST', data);
    },
    
    async saveLeaveQuotas(data) {
        return await this.request('/leave/quotas', 'POST', data);
    },
    
    // Settings endpoints
    async performYearlyReset(year) {
        return await this.request('/settings/year-reset', 'POST', { year });
    }
};

// UI Helper functions
const UI = {
    showLoading() {
        document.getElementById('loading-overlay').classList.remove('hidden');
    },
    
    hideLoading() {
        document.getElementById('loading-overlay').classList.add('hidden');
    },
    
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        const icons = {
            success: '✓',
            error: '✗',
            warning: '⚠',
            info: 'ℹ'
        };
        
        toast.innerHTML = `
            <span class="toast-icon">${icons[type]}</span>
            <span class="toast-message">${message}</span>
        `;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideInRight 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },
    
    openModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        
        // Focus first input
        const firstInput = modal.querySelector('input, select, textarea');
        if (firstInput) {
            setTimeout(() => firstInput.focus(), 100);
        }
    },
    
    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
    },
    
    showConfirmDialog(message, onConfirm) {
        document.getElementById('modal-confirm-message').textContent = message;
        this.openModal('modal-confirm');
        
        const confirmBtn = document.getElementById('modal-confirm-btn');
        const newBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
        
        newBtn.onclick = () => {
            this.closeModal('modal-confirm');
            onConfirm();
        };
    }
};

// Storage helper
const Storage = {
    save(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.error('Storage save failed:', e);
        }
    },
    
    load(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (e) {
            console.error('Storage load failed:', e);
            return defaultValue;
        }
    }
};

/* ===================================
   DATA LOADING FUNCTIONS
   =================================== */

async function loadEmployees() {
    try {
        UI.showLoading();
        const response = await API.getEmployees();
        state.employees = response.data || [];
        renderEmployeeSelector();
        
        // Load saved employee or select first
        const savedEmployeeId = Storage.load('currentEmployeeId');
        if (savedEmployeeId && state.employees.find(e => e.EmployeeID === savedEmployeeId)) {
            state.currentEmployeeId = savedEmployeeId;
        } else if (state.employees.length > 0) {
            state.currentEmployeeId = state.employees[0].EmployeeID;
        }
        
        if (state.currentEmployeeId) {
            document.getElementById('employee-select').value = state.currentEmployeeId;
            await loadEmployeeData();
        }
    } catch (error) {
        UI.showToast('Failed to load employees: ' + error.message, 'error');
    } finally {
        UI.hideLoading();
    }
}

async function loadEmployeeData() {
    if (!state.currentEmployeeId) return;
    
    try {
        UI.showLoading();
        
        state.currentEmployee = state.employees.find(e => e.EmployeeID === state.currentEmployeeId);
        
        // Load attendance for current year
        const yearStart = DateUtils.getYearStartDate(state.currentYear);
        const yearEnd = `${state.currentYear}-12-31`;
        const attendanceResponse = await API.getAttendance(state.currentEmployeeId, yearStart, yearEnd);
        state.attendanceRecords = attendanceResponse.data || [];
        
        // Load leave quotas
        const quotasResponse = await API.getLeaveQuotas(state.currentYear);
        state.leaveQuotas = quotasResponse.data || CONFIG.DEFAULT_QUOTAS;
        
        // Load leave usage
        const usageResponse = await API.getLeaveUsage(state.currentEmployeeId, state.currentYear);
        state.leaveUsage = usageResponse.data || {
            AnnualUsed: 0,
            CasualUsed: 0,
            SickUsed: 0,
            WFHCount: 0
        };
        
        // Render all UI
        renderDashboard();
        renderAttendancePage();
        renderLeavesPage();
        
        // Save current employee
        Storage.save('currentEmployeeId', state.currentEmployeeId);
    } catch (error) {
        UI.showToast('Failed to load employee data: ' + error.message, 'error');
    } finally {
        UI.hideLoading();
    }
}

/* ===================================
   RENDERING FUNCTIONS
   =================================== */

function renderEmployeeSelector() {
    const select = document.getElementById('employee-select');
    select.innerHTML = state.employees.map(emp => 
        `<option value="${emp.EmployeeID}">${emp.Name} (${emp.EmployeeID})</option>`
    ).join('');
}

function renderDashboard() {
    if (!state.currentEmployee) return;
    
    const emp = state.currentEmployee;
    
    // Profile card
    const photoUrl = emp.PhotoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(emp.Name)}&size=200&background=4f46e5&color=fff`;
    document.getElementById('profile-photo').src = photoUrl;
    document.getElementById('profile-photo').alt = `${emp.Name}'s photo`;
    document.getElementById('profile-name').textContent = emp.Name;
    document.getElementById('profile-id').textContent = `ID: ${emp.EmployeeID}`;
    document.getElementById('profile-department').textContent = emp.Department;
    document.getElementById('profile-role').textContent = emp.Role;
    
    // Today's status
    renderTodayStatus();
    
    // Leave summary
    document.getElementById('leave-year').textContent = `(${state.currentYear})`;
    renderLeaveSummary();
    
    // Charts
    renderCharts();
}

function renderTodayStatus() {
    const today = DateUtils.getTodayString();
    const todayRecord = state.attendanceRecords.find(r => r.Date === today);
    
    if (todayRecord) {
        document.getElementById('today-clockin').textContent = DateUtils.formatTime(todayRecord.ClockIn);
        document.getElementById('today-clockout').textContent = DateUtils.formatTime(todayRecord.ClockOut);
        
        const hours = DateUtils.calculateHours(todayRecord.ClockIn, todayRecord.ClockOut, todayRecord.BreakMinutes || 0);
        document.getElementById('today-hours').textContent = `${hours.toFixed(2)}h`;
        
        document.getElementById('today-wfh').textContent = todayRecord.WFH ? 'Yes' : 'No';
    } else {
        document.getElementById('today-clockin').textContent = '--:--';
        document.getElementById('today-clockout').textContent = '--:--';
        document.getElementById('today-hours').textContent = '0.00h';
        document.getElementById('today-wfh').textContent = 'No';
    }
}

function renderLeaveSummary() {
    const quotas = state.leaveQuotas;
    const usage = state.leaveUsage;
    
    // Annual
    const annualAllocated = quotas.AnnualAllocated || CONFIG.DEFAULT_QUOTAS.Annual;
    const annualUsed = usage.AnnualUsed || 0;
    const annualRemaining = annualAllocated - annualUsed;
    
    document.getElementById('annual-allocated').textContent = annualAllocated;
    document.getElementById('annual-used').textContent = annualUsed;
    document.getElementById('annual-remaining').textContent = annualRemaining;
    document.getElementById('annual-progress').style.width = `${(annualUsed / annualAllocated) * 100}%`;
    
    // Casual
    const casualAllocated = quotas.CasualAllocated || CONFIG.DEFAULT_QUOTAS.Casual;
    const casualUsed = usage.CasualUsed || 0;
    const casualRemaining = casualAllocated - casualUsed;
    
    document.getElementById('casual-allocated').textContent = casualAllocated;
    document.getElementById('casual-used').textContent = casualUsed;
    document.getElementById('casual-remaining').textContent = casualRemaining;
    document.getElementById('casual-progress').style.width = `${(casualUsed / casualAllocated) * 100}%`;
    
    // Sick
    const sickAllocated = quotas.SickAllocated || CONFIG.DEFAULT_QUOTAS.Sick;
    const sickUsed = usage.SickUsed || 0;
    const sickRemaining = sickAllocated - sickUsed;
    
    document.getElementById('sick-allocated').textContent = sickAllocated;
    document.getElementById('sick-used').textContent = sickUsed;
    document.getElementById('sick-remaining').textContent = sickRemaining;
    document.getElementById('sick-progress').style.width = `${(sickUsed / sickAllocated) * 100}%`;
    
    // WFH count
    document.getElementById('wfh-count').textContent = usage.WFHCount || 0;
}

function renderCharts() {
    renderLeaveChart();
    renderHoursChart();
}

function renderLeaveChart() {
    const ctx = document.getElementById('leave-chart');
    if (!ctx) return;
    
    // Destroy existing chart
    if (window.leaveChartInstance) {
        window.leaveChartInstance.destroy();
    }
    
    const usage = state.leaveUsage;
    
    window.leaveChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Annual Used', 'Casual Used', 'Sick Used', 'WFH Days'],
            datasets: [{
                data: [
                    usage.AnnualUsed || 0,
                    usage.CasualUsed || 0,
                    usage.SickUsed || 0,
                    usage.WFHCount || 0
                ],
                backgroundColor: [
                    'rgba(249, 115, 22, 0.8)',
                    'rgba(20, 184, 166, 0.8)',
                    'rgba(239, 68, 68, 0.8)',
                    'rgba(59, 130, 246, 0.8)'
                ],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

function renderHoursChart() {
    const ctx = document.getElementById('hours-chart');
    if (!ctx) return;
    
    // Destroy existing chart
    if (window.hoursChartInstance) {
        window.hoursChartInstance.destroy();
    }
    
    // Get last 30 days
    const today = DateUtils.getCurrentDhakaDate();
    const last30Days = [];
    const hoursData = [];
    
    for (let i = 29; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = DateUtils.formatDate(date);
        last30Days.push(dateStr);
        
        const record = state.attendanceRecords.find(r => r.Date === dateStr);
        if (record && record.LeaveType === 'None') {
            const hours = DateUtils.calculateHours(record.ClockIn, record.ClockOut, record.BreakMinutes || 0);
            hoursData.push(hours);
        } else {
            hoursData.push(0);
        }
    }
    
    window.hoursChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: last30Days.map(d => d.substring(5)), // MM-DD format
            datasets: [{
                label: 'Hours Worked',
                data: hoursData,
                borderColor: 'rgba(79, 70, 229, 1)',
                backgroundColor: 'rgba(79, 70, 229, 0.1)',
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 12
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

function renderAttendancePage() {
    applyFilters();
    renderAttendanceTable();
}

function applyFilters() {
    let filtered = [...state.attendanceRecords];
    
    const filters = state.filters;
    
    if (filters.dateFrom) {
        filtered = filtered.filter(r => r.Date >= filters.dateFrom);
    }
    
    if (filters.dateTo) {
        filtered = filtered.filter(r => r.Date <= filters.dateTo);
    }
    
    if (filters.wfh !== '') {
        const wfhValue = filters.wfh === 'true';
        filtered = filtered.filter(r => r.WFH === wfhValue);
    }
    
    if (filters.leaveType) {
        filtered = filtered.filter(r => r.LeaveType === filters.leaveType);
    }
    
    if (filters.minHours) {
        filtered = filtered.filter(r => {
            const hours = DateUtils.calculateHours(r.ClockIn, r.ClockOut, r.BreakMinutes || 0);
            return hours >= parseFloat(filters.minHours);
        });
    }
    
    if (filters.maxHours) {
        filtered = filtered.filter(r => {
            const hours = DateUtils.calculateHours(r.ClockIn, r.ClockOut, r.BreakMinutes || 0);
            return hours <= parseFloat(filters.maxHours);
        });
    }
    
    // Sort
    filtered.sort((a, b) => {
        let aVal = a[state.sortColumn];
        let bVal = b[state.sortColumn];
        
        if (state.sortColumn === 'hours') {
            aVal = DateUtils.calculateHours(a.ClockIn, a.ClockOut, a.BreakMinutes || 0);
            bVal = DateUtils.calculateHours(b.ClockIn, b.ClockOut, b.BreakMinutes || 0);
        }
        
        if (state.sortDirection === 'asc') {
            return aVal > bVal ? 1 : -1;
        } else {
            return aVal < bVal ? 1 : -1;
        }
    });
    
    state.filteredAttendanceRecords = filtered;
    state.currentPage = 1;
}

function renderAttendanceTable() {
    const tbody = document.getElementById('attendance-tbody');
    const records = state.filteredAttendanceRecords;
    
    if (records.length === 0) {
        tbody.innerHTML = '<tr class="empty-state"><td colspan="9">No attendance records found</td></tr>';
        updatePagination();
        return;
    }
    
    // Pagination
    const start = (state.currentPage - 1) * CONFIG.ITEMS_PER_PAGE;
    const end = start + CONFIG.ITEMS_PER_PAGE;
    const pageRecords = records.slice(start, end);
    
    tbody.innerHTML = pageRecords.map(record => {
        const hours = DateUtils.calculateHours(record.ClockIn, record.ClockOut, record.BreakMinutes || 0);
        const hoursClass = hours > 9 ? 'hours-long' : '';
        
        const wfhBadge = record.WFH ? '<span class="table-badge badge-wfh">WFH</span>' : '';
        
        let leaveBadge = '';
        if (record.LeaveType !== 'None') {
            const leaveClass = `badge-leave-${record.LeaveType.toLowerCase()}`;
            leaveBadge = `<span class="table-badge ${leaveClass}">${record.LeaveType}</span>`;
        } else {
            leaveBadge = '<span class="table-badge badge-leave-none">-</span>';
        }
        
        return `
            <tr>
                <td>${record.Date}</td>
                <td>${DateUtils.formatTime(record.ClockIn)}</td>
                <td>${DateUtils.formatTime(record.ClockOut)}</td>
                <td>${record.BreakMinutes || 0}</td>
                <td class="${hoursClass}">${hours.toFixed(2)}</td>
                <td>${wfhBadge}</td>
                <td>${leaveBadge}</td>
                <td>${record.Notes || '-'}</td>
                <td>
                    <div class="table-actions">
                        <button class="btn-icon" onclick="editAttendance('${record.Date}')" title="Edit">
                            ✏️
                        </button>
                        <button class="btn-icon btn-delete" onclick="deleteAttendance('${record.Date}')" title="Delete">
                            🗑️
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    
    updatePagination();
}

function updatePagination() {
    const totalRecords = state.filteredAttendanceRecords.length;
    const totalPages = Math.ceil(totalRecords / CONFIG.ITEMS_PER_PAGE);
    
    document.getElementById('page-info').textContent = `Page ${state.currentPage} of ${totalPages || 1}`;
    document.getElementById('btn-prev-page').disabled = state.currentPage === 1;
    document.getElementById('btn-next-page').disabled = state.currentPage === totalPages || totalPages === 0;
}

function renderLeavesPage() {
    const quotas = state.leaveQuotas;
    
    document.getElementById('quota-annual').textContent = `${quotas.AnnualAllocated || 15} days`;
    document.getElementById('quota-casual').textContent = `${quotas.CasualAllocated || 10} days`;
    document.getElementById('quota-sick').textContent = `${quotas.SickAllocated || 14} days`;
    
    renderLeaveHistory();
}

function renderLeaveHistory() {
    const tbody = document.getElementById('leave-tbody');
    const leaveRecords = state.attendanceRecords.filter(r => r.LeaveType !== 'None');
    
    if (leaveRecords.length === 0) {
        tbody.innerHTML = '<tr class="empty-state"><td colspan="4">No leave records found</td></tr>';
        return;
    }
    
    tbody.innerHTML = leaveRecords.map(record => {
        const leaveClass = `badge-leave-${record.LeaveType.toLowerCase()}`;
        return `
            <tr>
                <td>${record.Date}</td>
                <td><span class="table-badge ${leaveClass}">${record.LeaveType}</span></td>
                <td>${record.Notes || '-'}</td>
                <td>
                    <div class="table-actions">
                        <button class="btn-icon btn-delete" onclick="deleteAttendance('${record.Date}')" title="Delete">
                            🗑️
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

/* ===================================
   EVENT HANDLERS
   =================================== */

// Navigation
function setupNavigation() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = e.target.dataset.page;
            
            // Update nav
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            e.target.classList.add('active');
            
            // Show page
            document.querySelectorAll('.page-content').forEach(p => p.classList.remove('active'));
            document.getElementById(`page-${page}`).classList.add('active');
        });
    });
}

// Employee selector
function setupEmployeeSelector() {
    document.getElementById('employee-select').addEventListener('change', async (e) => {
        state.currentEmployeeId = e.target.value;
        await loadEmployeeData();
    });
}

// Clock in/out buttons
function setupQuickActions() {
    document.getElementById('btn-clockin-now').addEventListener('click', () => {
        const now = DateUtils.getCurrentDhakaDate();
        const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        
        document.getElementById('form-date').value = DateUtils.formatDate(now);
        document.getElementById('form-clockin').value = time;
        document.getElementById('form-clockout').value = '';
        document.getElementById('form-attendance-id').value = DateUtils.formatDate(now);
        
        UI.openModal('modal-attendance');
    });
    
    document.getElementById('btn-clockout-now').addEventListener('click', () => {
        const today = DateUtils.getTodayString();
        const todayRecord = state.attendanceRecords.find(r => r.Date === today);
        
        if (!todayRecord) {
            UI.showToast('Please clock in first!', 'warning');
            return;
        }
        
        const now = DateUtils.getCurrentDhakaDate();
        const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        
        document.getElementById('form-date').value = today;
        document.getElementById('form-clockin').value = todayRecord.ClockIn;
        document.getElementById('form-clockout').value = time;
        document.getElementById('form-break').value = todayRecord.BreakMinutes || 0;
        document.getElementById('form-wfh').checked = todayRecord.WFH;
        document.getElementById('form-leave-type').value = todayRecord.LeaveType || 'None';
        document.getElementById('form-notes').value = todayRecord.Notes || '';
        document.getElementById('form-attendance-id').value = today;
        
        UI.openModal('modal-attendance');
    });
}

// Attendance modal
function setupAttendanceModal() {
    document.getElementById('btn-add-attendance').addEventListener('click', () => {
        document.getElementById('attendance-form').reset();
        document.getElementById('form-attendance-id').value = '';
        document.getElementById('form-date').value = DateUtils.getTodayString();
        document.getElementById('modal-attendance-title').textContent = 'Add Attendance Entry';
        UI.openModal('modal-attendance');
    });
    
    document.getElementById('attendance-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveAttendance();
    });
    
    // Validate leave type and WFH
    document.getElementById('form-leave-type').addEventListener('change', (e) => {
        if (e.target.value !== 'None') {
            document.getElementById('form-wfh').checked = false;
            document.getElementById('form-wfh').disabled = true;
        } else {
            document.getElementById('form-wfh').disabled = false;
        }
    });
}

async function saveAttendance() {
    const date = document.getElementById('form-date').value;
    const clockIn = document.getElementById('form-clockin').value;
    const clockOut = document.getElementById('form-clockout').value;
    const breakMinutes = parseInt(document.getElementById('form-break').value) || 0;
    const wfh = document.getElementById('form-wfh').checked;
    const leaveType = document.getElementById('form-leave-type').value;
    const notes = document.getElementById('form-notes').value;
    
    // Validation
    if (!date || !clockIn || !clockOut) {
        UI.showToast('Please fill all required fields', 'error');
        return;
    }
    
    if (!DateUtils.isValidTime(clockIn) || !DateUtils.isValidTime(clockOut)) {
        UI.showToast('Invalid time format', 'error');
        return;
    }
    
    if (breakMinutes < 0) {
        UI.showToast('Break minutes cannot be negative', 'error');
        return;
    }
    
    try {
        UI.showLoading();
        
        await API.saveAttendance({
            Date: date,
            EmployeeID: state.currentEmployeeId,
            ClockIn: clockIn,
            ClockOut: clockOut,
            BreakMinutes: breakMinutes,
            WFH: leaveType === 'None' ? wfh : false,
            LeaveType: leaveType,
            Notes: notes
        });
        
        UI.showToast('Attendance saved successfully!', 'success');
        UI.closeModal('modal-attendance');
        await loadEmployeeData();
    } catch (error) {
        UI.showToast('Failed to save attendance: ' + error.message, 'error');
    } finally {
        UI.hideLoading();
    }
}

function editAttendance(date) {
    const record = state.attendanceRecords.find(r => r.Date === date);
    if (!record) return;
    
    document.getElementById('form-date').value = record.Date;
    document.getElementById('form-clockin').value = record.ClockIn;
    document.getElementById('form-clockout').value = record.ClockOut;
    document.getElementById('form-break').value = record.BreakMinutes || 0;
    document.getElementById('form-wfh').checked = record.WFH;
    document.getElementById('form-leave-type').value = record.LeaveType || 'None';
    document.getElementById('form-notes').value = record.Notes || '';
    document.getElementById('form-attendance-id').value = date;
    
    document.getElementById('modal-attendance-title').textContent = 'Edit Attendance Entry';
    UI.openModal('modal-attendance');
}

function deleteAttendance(date) {
    UI.showConfirmDialog(
        `Are you sure you want to delete the attendance record for ${date}?`,
        async () => {
            try {
                UI.showLoading();
                await API.deleteAttendance(date, state.currentEmployeeId);
                UI.showToast('Attendance deleted successfully!', 'success');
                await loadEmployeeData();
            } catch (error) {
                UI.showToast('Failed to delete attendance: ' + error.message, 'error');
            } finally {
                UI.hideLoading();
            }
        }
    );
}

// Filters
function setupFilters() {
    document.getElementById('btn-apply-filters').addEventListener('click', () => {
        state.filters = {
            dateFrom: document.getElementById('filter-date-from').value,
            dateTo: document.getElementById('filter-date-to').value,
            wfh: document.getElementById('filter-wfh').value,
            leaveType: document.getElementById('filter-leave-type').value,
            minHours: document.getElementById('filter-min-hours').value,
            maxHours: document.getElementById('filter-max-hours').value
        };
        
        Storage.save('attendanceFilters', state.filters);
        applyFilters();
        renderAttendanceTable();
    });
    
    document.getElementById('btn-clear-filters').addEventListener('click', () => {
        document.getElementById('filter-date-from').value = '';
        document.getElementById('filter-date-to').value = '';
        document.getElementById('filter-wfh').value = '';
        document.getElementById('filter-leave-type').value = '';
        document.getElementById('filter-min-hours').value = '';
        document.getElementById('filter-max-hours').value = '';
        
        state.filters = {
            dateFrom: null,
            dateTo: null,
            wfh: '',
            leaveType: '',
            minHours: '',
            maxHours: ''
        };
        
        Storage.save('attendanceFilters', state.filters);
        applyFilters();
        renderAttendanceTable();
    });
    
    // Load saved filters
    const savedFilters = Storage.load('attendanceFilters');
    if (savedFilters) {
        state.filters = savedFilters;
        document.getElementById('filter-date-from').value = savedFilters.dateFrom || '';
        document.getElementById('filter-date-to').value = savedFilters.dateTo || '';
        document.getElementById('filter-wfh').value = savedFilters.wfh || '';
        document.getElementById('filter-leave-type').value = savedFilters.leaveType || '';
        document.getElementById('filter-min-hours').value = savedFilters.minHours || '';
        document.getElementById('filter-max-hours').value = savedFilters.maxHours || '';
    }
}

// Export CSV
function setupExport() {
    document.getElementById('btn-export-csv').addEventListener('click', () => {
        const records = state.filteredAttendanceRecords;
        if (records.length === 0) {
            UI.showToast('No records to export', 'warning');
            return;
        }
        
        let csv = 'Date,Clock In,Clock Out,Break (min),Total Hours,WFH,Leave Type,Notes\n';
        records.forEach(record => {
            const hours = DateUtils.calculateHours(record.ClockIn, record.ClockOut, record.BreakMinutes || 0);
            csv += `${record.Date},${record.ClockIn},${record.ClockOut},${record.BreakMinutes || 0},${hours.toFixed(2)},${record.WFH ? 'Yes' : 'No'},${record.LeaveType},"${record.Notes || ''}"\n`;
        });
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `attendance_${state.currentEmployeeId}_${Date.now()}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
        
        UI.showToast('CSV exported successfully!', 'success');
    });
}

// Pagination
function setupPagination() {
    document.getElementById('btn-prev-page').addEventListener('click', () => {
        if (state.currentPage > 1) {
            state.currentPage--;
            renderAttendanceTable();
        }
    });
    
    document.getElementById('btn-next-page').addEventListener('click', () => {
        const totalPages = Math.ceil(state.filteredAttendanceRecords.length / CONFIG.ITEMS_PER_PAGE);
        if (state.currentPage < totalPages) {
            state.currentPage++;
            renderAttendanceTable();
        }
    });
}

// Sorting
function setupSorting() {
    document.querySelectorAll('#attendance-table th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.dataset.sort;
            
            if (state.sortColumn === column) {
                state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                state.sortColumn = column;
                state.sortDirection = 'desc';
            }
            
            // Update UI
            document.querySelectorAll('#attendance-table th').forEach(h => {
                h.classList.remove('sorted-asc', 'sorted-desc');
            });
            th.classList.add(`sorted-${state.sortDirection}`);
            
            applyFilters();
            renderAttendanceTable();
        });
    });
}

// Leave modal
function setupLeaveModal() {
    document.getElementById('btn-request-leave').addEventListener('click', () => {
        document.getElementById('leave-form').reset();
        document.getElementById('leave-form-date').value = DateUtils.getTodayString();
        UI.openModal('modal-leave');
    });
    
    document.getElementById('leave-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await requestLeave();
    });
}

async function requestLeave() {
    const leaveType = document.getElementById('leave-form-type').value;
    const date = document.getElementById('leave-form-date').value;
    const reason = document.getElementById('leave-form-reason').value;
    
    if (!leaveType || !date || !reason) {
        UI.showToast('Please fill all fields', 'error');
        return;
    }
    
    // Check if already has attendance for this date
    const existing = state.attendanceRecords.find(r => r.Date === date);
    
    try {
        UI.showLoading();
        
        // Create attendance record with leave
        await API.saveAttendance({
            Date: date,
            EmployeeID: state.currentEmployeeId,
            ClockIn: '00:00',
            ClockOut: '00:00',
            BreakMinutes: 0,
            WFH: false,
            LeaveType: leaveType,
            Notes: reason
        });
        
        UI.showToast('Leave request submitted successfully!', 'success');
        UI.closeModal('modal-leave');
        await loadEmployeeData();
    } catch (error) {
        UI.showToast('Failed to request leave: ' + error.message, 'error');
    } finally {
        UI.hideLoading();
    }
}

// Settings
function setupSettings() {
    // Load current quotas
    document.getElementById('setting-annual').value = state.leaveQuotas.AnnualAllocated || 15;
    document.getElementById('setting-casual').value = state.leaveQuotas.CasualAllocated || 10;
    document.getElementById('setting-sick').value = state.leaveQuotas.SickAllocated || 14;
    document.getElementById('setting-year-start').value = state.leaveQuotas.YearStartDate || `${state.currentYear}-01-01`;
    
    // Quotas form
    document.getElementById('quotas-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const annual = parseInt(document.getElementById('setting-annual').value);
        const casual = parseInt(document.getElementById('setting-casual').value);
        const sick = parseInt(document.getElementById('setting-sick').value);
        
        try {
            UI.showLoading();
            await API.saveLeaveQuotas({
                Year: state.currentYear,
                AnnualAllocated: annual,
                CasualAllocated: casual,
                SickAllocated: sick,
                YearStartDate: document.getElementById('setting-year-start').value
            });
            
            UI.showToast('Quotas saved successfully!', 'success');
            await loadEmployeeData();
        } catch (error) {
            UI.showToast('Failed to save quotas: ' + error.message, 'error');
        } finally {
            UI.hideLoading();
        }
    });
    
    // Year config form
    document.getElementById('year-config-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        try {
            UI.showLoading();
            await API.saveLeaveQuotas({
                Year: state.currentYear,
                AnnualAllocated: state.leaveQuotas.AnnualAllocated || 15,
                CasualAllocated: state.leaveQuotas.CasualAllocated || 10,
                SickAllocated: state.leaveQuotas.SickAllocated || 14,
                YearStartDate: document.getElementById('setting-year-start').value
            });
            
            UI.showToast('Year start date updated!', 'success');
        } catch (error) {
            UI.showToast('Failed to update year start date: ' + error.message, 'error');
        } finally {
            UI.hideLoading();
        }
    });
    
    // Yearly reset
    document.getElementById('btn-yearly-reset').addEventListener('click', () => {
        UI.showConfirmDialog(
            'Are you sure you want to perform a yearly reset? This will create new leave quotas for the next year.',
            async () => {
                try {
                    UI.showLoading();
                    await API.performYearlyReset(state.currentYear + 1);
                    UI.showToast('Yearly reset completed successfully!', 'success');
                    state.currentYear++;
                    await loadEmployeeData();
                } catch (error) {
                    UI.showToast('Failed to perform yearly reset: ' + error.message, 'error');
                } finally {
                    UI.hideLoading();
                }
            }
        );
    });
    
    // Connection test
    document.getElementById('connection-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        try {
            UI.showLoading();
            const response = await API.getEmployees();
            if (response.data) {
                UI.showToast('Connection successful!', 'success');
            } else {
                UI.showToast('Connection failed: No data returned', 'error');
            }
        } catch (error) {
            UI.showToast('Connection failed: ' + error.message, 'error');
        } finally {
            UI.hideLoading();
        }
    });
}

// Modal controls
function setupModals() {
    // Close buttons
    document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.modal').classList.remove('active');
        });
    });
    
    // Close on backdrop click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
    
    // ESC key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.active').forEach(modal => {
                modal.classList.remove('active');
            });
        }
    });
}

// Clock
function updateClock() {
    const now = DateUtils.getCurrentDhakaDate();
    
    const dateStr = now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: CONFIG.TIMEZONE
    });
    
    const timeStr = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: CONFIG.TIMEZONE
    });
    
    const dateElement = document.querySelector('.datetime-display .date');
    const timeElement = document.querySelector('.datetime-display .time');
    
    if (dateElement) dateElement.textContent = dateStr;
    if (timeElement) timeElement.textContent = timeStr + ' GMT+6';
}

/* ===================================
   INITIALIZATION
   =================================== */

async function init() {
    console.log('Initializing Employee Attendance System...');
    
    // Check if BASE_URL is configured
    if (CONFIG.BASE_URL === 'YOUR_APPS_SCRIPT_WEB_APP_URL_HERE') {
        UI.showToast('⚠️ Please configure your Google Apps Script URL in app.js', 'warning');
    }
    
    // Setup all event listeners
    setupNavigation();
    setupEmployeeSelector();
    setupQuickActions();
    setupAttendanceModal();
    setupLeaveModal();
    setupFilters();
    setupExport();
    setupPagination();
    setupSorting();
    setupSettings();
    setupModals();
    
    // Start clock
    updateClock();
    setInterval(updateClock, 1000);
    
    // Load initial data
    await loadEmployees();
    
    console.log('Initialization complete!');
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Make functions globally accessible for inline handlers
window.editAttendance = editAttendance;
window.deleteAttendance = deleteAttendance;
