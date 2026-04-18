const fs = require('fs');

function parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    return lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const obj = {};
        headers.forEach((h, i) => { 
            let val = vals[i] || '';
            // Handle array fields
            if (h === 'enrolledCourses') {
                obj[h] = val ? val.split(';').map(x => x.trim()) : [];
            } else {
                obj[h] = val;
            }
        });
        return obj;
    });
}

const text = fs.readFileSync('mock_users.csv', 'utf8');
const parsed = parseCSV(text);
const rolePrefixes = { student: 'S', faculty: 'F', admin: 'A', dean: 'D', hod: 'H', superuser: 'SU' };

const departmentsList = [
  { name: 'Computer Science' },
  { name: 'Mechanical Engineering' },
  { name: 'Physics' },
  { name: 'Electrical Engineering' },
  { name: 'Mathematics' }
];

const invalidUsers = parsed.filter(u => {
    if (!u.id || !u.name || !u.role || !u.password) return true;
    if (!/^[a-zA-Z0-9]+$/.test(u.id)) return true;
    const prefix = rolePrefixes[u.role.toLowerCase()];
    if (!prefix || !u.id.toUpperCase().startsWith(prefix)) return true;
    // Department check for academic roles
    if (['student', 'faculty', 'hod'].includes(u.role.toLowerCase())) {
        if (u.department && u.department !== 'Unassigned') {
            if (!departmentsList.some(d => d.name === u.department)) return true;
        }
    }
    return false;
});

console.log('Invalid users count:', invalidUsers.length);
console.log(invalidUsers);
