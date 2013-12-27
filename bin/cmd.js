#!/usr/bin/env node
var minimist = require('minimist');
var argv = minimist(process.argv.slice(2), {
    'alias': { 'i': [ 'interface', 'iface' ] }
});

var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var concat = require('concat-stream');
var table = require('text-table');

var getIface = require('../lib/iface.js');
var iwscan = require('../lib/scan.js');

var preferred = [ 'sudoroom' ];
function accessible (sig) {
    return !sig.wpa && !sig.rsn && !sig['ht operation'];
}

if (argv._.length === 0 || argv._[0] === 'auto') {
    return getSorted(function (err, sorted) {
        if (err) return console.error(err);
        
        sorted.forEach(function (r) {
            console.log(r.ssid, r.signal, r['last seen']);
        });
    });
}
if (argv._[0] === 'start') return (function () {
    var pending = 2;
    var iface;
    checkRunning(function (running) { if (!running) next() })
    getInterface(function (ifc) { next(iface = ifc) });
    
    function next () {
        if (--pending !== 0) return;
        
        var args = [ '-i', iface, '-c', '/etc/wpa_supplicant.conf' ];
        spawn('wpa_supplicant', args, { stdio: 'inherit' });
        spawn('dhclient', [ iface, '-r' ]).on('exit', function () {
            spawn('dhclient', [ iface, '-d' ], { stdio: 'inherit' });
        });
    }
})()

if (argv._[0] === 'add') {
    if (argv._.length < 3) {
        console.error('usage: wit add SSID PASSPHRASE');
        return process.exit(1);
    }
    spawn('wpa_passphrase', argv._[1], argv._[2])
        .pipe(concat(function (body) {
            
        }))
    ;
    return;
}

function getInterface (cb) {
    if (argv.i) return process.nextTick(function () { cb(argv.i) });
    
    getIface(function (err, ifaces) {
        if (err) {
            console.error(err);
        }
        else if (ifaces.length > 1) {
            console.error(
                'Too many interfaces. Disambiguate with -i:\n\n'
                + ifaces.map(function (s) { return '  ' + s }).join('\n')
                + '\n'
            );
        }
        else if (ifaces.length === 0) {
            console.error(
                'No interfaces found.'
                + ' Use -i to select an interface manually'
            );
        }
        else cb(ifaces[0]);
    });
}

function checkRunning (cb) {
    var args = [ '-l', '^(wpa_supplicant|dhclient)' ];
    exec('pgrep ' + args.join(' '), function (err, stdout) {
        if (stdout.length > 2) {
            console.error(
                'WARNING: these processes are already already running:\n'
                + stdout.split('\n')
                    .map(function (line) { return '  ' + line })
                    .join('\n')
                + '\nProbably nothing will work while those processes are'
                + ' running.'
            );
            cb(true);
        }
        else if (cb) cb(false);
    });
}

function getSorted (cb) {
    getInterface(function (iface) {
        iwscan(iface, function (err, rows) {
            if (err) return cb(err);
            
            var sorted = Object.keys(rows)
                .map(function (key) { return rows[key] })
                .filter(accessible)
                .sort(cmp)
            ;
            cb(null, sorted);
            
            function cmp (a, b) {
                var pa = preferred.indexOf(a.ssid) >= 0;
                var pb = preferred.indexOf(b.ssid) >= 0;
                if (pa ^ pb) return pa ? -1 : 1;
                
                var sa = parseFloat(a.signal);
                var sb = parseFloat(b.signal);
                
                var la = parseInt(a['last seen']);
                var lb = parseInt(b['last seen']);
                
                return sa < sb ? 1 : -1;
            }
        });
    });
}
