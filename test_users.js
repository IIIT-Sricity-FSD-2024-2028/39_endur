const fs = require('fs');

const text = fs.readFileSync('mock_users.json', 'utf8');
const parsed = JSON.parse(text);
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
