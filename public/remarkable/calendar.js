// reMarkable planner, self-hosted (system_3 #9132). Copied from
// the-anonymous-aspirant/remarkable-pdf-journal at 4886037; inline styles
// became classes (calendar.css), and ?year=next selects next year's
// calendar, the only difference between the two original files.
        const yearOffset = new URLSearchParams(window.location.search).get('year') === 'next' ? 1 : 0;
        const year = new Date().getFullYear() + yearOffset;
        document.title = `${year} Planner`;
        
        function getWeeksInYear(year) {
            const weeks = [];
            let date = new Date(year, 0, 1);
            
            while (date.getDay() !== 1) {
                date.setDate(date.getDate() - 1);
            }
            
            while (date.getFullYear() <= year) {
                const weekStart = new Date(date);
                const weekEnd = new Date(date);
                weekEnd.setDate(weekEnd.getDate() + 6);
                
                const weekNum = getWeekNumber(weekStart);
                
                if (weekStart.getFullYear() > year) break;
                
                weeks.push({
                    num: weekNum,
                    start: new Date(weekStart),
                    end: new Date(weekEnd)
                });
                
                date.setDate(date.getDate() + 7);
            }
            
            return weeks;
        }
        
        function getWeekNumber(date) {
            const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
            const dayNum = d.getUTCDay() || 7;
            d.setUTCDate(d.getUTCDate() + 4 - dayNum);
            const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
            return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        }
        
        function formatDate(date, format) {
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const monthsFull = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            
            const d = date.getDate();
            const m = date.getMonth();
            const y = date.getFullYear();
            const dow = date.getDay();
            
            if (format === 'day-page') {
                return `${days[dow]} ${d} ${months[m]}`;
            } else if (format === 'day-short') {
                return `${days[dow]} ${d}`;
            } else if (format === 'full-date') {
                return `${String(d).padStart(2, '0')}.${String(m + 1).padStart(2, '0')}.${y}`;
            } else if (format === 'month-full') {
                return monthsFull[m];
            }
            return date.toDateString();
        }
        
        function dateId(date) {
            return `date-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        }
        
        function navBar() {
            return `
                <div class="rp-s1">
                    <a class="rp-s2" href="#blank-1" title="Blank Page 1">I</a>
                    <a class="rp-s2" href="#blank-2" title="Blank Page 2">II</a>
                    <a class="rp-s2" href="#blank-3" title="Blank Page 3">III</a>
                    <a class="rp-s2" href="#blank-4" title="Blank Page 4">IV</a>
                    <a class="rp-s2" href="#blank-5" title="Blank Page 5">V</a>
                    <a class="rp-s2" href="#blank-6" title="Blank Page 6">VI</a>
                    <a class="rp-s2" href="#blank-7" title="Blank Page 7">VII</a>
                    <a class="rp-s2" href="#blank-8" title="Blank Page 8">VIII</a>
                    <a class="rp-s2" href="#blank-9" title="Blank Page 9">IX</a>
                    <a class="rp-s2" href="#blank-10" title="Blank Page 10">X</a>
                    <span class="rp-s3">│</span>
                    <a class="rp-s4" href="#index" title="Back to Index">⌂</a>
                </div>
            `;
        }
        
        function pageHeader(title) {
            return `
            <div class="rp-s5">
                <h2>${title}</h2>
                ${navBar()}
            </div>
            <hr class="rp-s6">
            `;
        }
        
        function dateLinkBox(date, text, highlighted = true) {
            return `<a href="#${dateId(date)}" class="rp-datebox ${highlighted ? 'rp-datebox--on' : 'rp-datebox--off'}">${text}</a>`;
        }
        
        let html = '';
        
        html += `
        <div class="page rp-s7" id="cover">
            <!-- cover image: the original shared reMarkable image is gone (404 on 2026-10-31) -->
        </div>
        `;
        
        html += `
        <div class="page" id="index">
            ${pageHeader(year.toString())}
            <div class="index-section">
        `;
        
        const weeks = getWeeksInYear(year);
        const weeksByMonth = {};
        
        for (let month = 1; month <= 12; month++) {
            weeksByMonth[month] = [];
        }
        
        weeks.forEach(week => {
            for (let d = new Date(week.start); d <= week.end; d.setDate(d.getDate() + 1)) {
                const date = new Date(d);
                if (date.getFullYear() === year) {
                    const month = date.getMonth() + 1;
                    if (!weeksByMonth[month].some(w => w.num === week.num)) {
                        weeksByMonth[month].push(week);
                    }
                }
            }
        });
        
        for (let month = 1; month <= 12; month++) {
            const monthDate = new Date(year, month - 1, 1);
            const monthName = formatDate(monthDate, 'month-full');
            const daysInMonth = new Date(year, month, 0).getDate();
            
            html += `
                <div class="month-block">
                    <h4><a href="#month-${month}">${monthName}</a></h4>
                    <div class="rp-s8">
            `;
            
            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(year, month - 1, day);
                html += `<a class="rp-s9" href="#${dateId(date)}">${day}</a>`;
            }
            
            html += `
                    </div>
                </div>
            `;
        }
        
        html += `
            </div>
        </div>
        `;
        
        html += `
        <div class="page" id="notes-index">
            ${pageHeader('Bookmarks')}
            <div class="rp-s10">
                <div class="rp-s11">
                    <a class="rp-s12" href="#blank-1">I</a>
                    <hr class="rp-s13">
                </div>
                <div class="rp-s11">
                    <a class="rp-s12" href="#blank-2">II</a>
                    <hr class="rp-s13">
                </div>
                <div class="rp-s11">
                    <a class="rp-s12" href="#blank-3">III</a>
                    <hr class="rp-s13">
                </div>
                <div class="rp-s11">
                    <a class="rp-s12" href="#blank-4">IV</a>
                    <hr class="rp-s13">
                </div>
                <div class="rp-s11">
                    <a class="rp-s12" href="#blank-5">V</a>
                    <hr class="rp-s13">
                </div>
                <div class="rp-s11">
                    <a class="rp-s12" href="#blank-6">VI</a>
                    <hr class="rp-s13">
                </div>
                <div class="rp-s11">
                    <a class="rp-s12" href="#blank-7">VII</a>
                    <hr class="rp-s13">
                </div>
                <div class="rp-s11">
                    <a class="rp-s12" href="#blank-8">VIII</a>
                    <hr class="rp-s13">
                </div>
                <div class="rp-s11">
                    <a class="rp-s12" href="#blank-9">IX</a>
                    <hr class="rp-s13">
                </div>
                <div class="rp-s11">
                    <a class="rp-s12" href="#blank-10">X</a>
                    <hr class="rp-s13">
                </div>
                <div class="rp-s11">
                    <a class="rp-s12" href="#blank-11">XI</a>
                    <hr class="rp-s13">
                </div>
                <div class="rp-s11">
                    <a class="rp-s12" href="#blank-12">XII</a>
                    <hr class="rp-s13">
                </div>
                <div class="rp-s11">
                    <a class="rp-s12" href="#blank-13">XIII</a>
                    <hr class="rp-s13">
                </div>
                <div class="rp-s11">
                    <a class="rp-s12" href="#blank-14">XIV</a>
                    <hr class="rp-s13">
                </div>
                <div class="rp-s11">
                    <a class="rp-s12" href="#blank-15">XV</a>
                    <hr class="rp-s13">
                </div>
                <div class="rp-s11">
                    <a class="rp-s12" href="#blank-16">XVI</a>
                    <hr class="rp-s13">
                </div>
                <div class="rp-s11">
                    <a class="rp-s12" href="#blank-17">XVII</a>
                    <hr class="rp-s13">
                </div>
                <div class="rp-s11">
                    <a class="rp-s12" href="#blank-18">XVIII</a>
                    <hr class="rp-s13">
                </div>
                <div class="rp-s11">
                    <a class="rp-s12" href="#blank-19">XIX</a>
                    <hr class="rp-s13">
                </div>
                <div class="rp-s11">
                    <a class="rp-s12" href="#blank-20">XX</a>
                    <hr class="rp-s13">
                </div>
            </div>
        </div>
        `;
        
        for (let month = 1; month <= 12; month++) {
            const monthDate = new Date(year, month - 1, 1);
            const monthName = formatDate(monthDate, 'month-full');
            const daysInMonth = new Date(year, month, 0).getDate();
            
            const prevMonth = month === 1 ? 12 : month - 1;
            const nextMonth = month === 12 ? 1 : month + 1;
            
            html += `
            <div class="page" id="month-${month}">
                <div class="rp-s5">
                    <h2 class="rp-s11">
                        <a class="rp-s4" href="#month-${prevMonth}">←</a>
                        <span>${monthName}</span>
                        <a class="rp-s4" href="#month-${nextMonth}">→</a>
                    </h2>
                    ${navBar()}
                </div>
                <hr class="rp-s6">
                <div class="rp-s14">
            `;
            
            const weeksInMonth = weeksByMonth[month];
            weeksInMonth.forEach(week => {
                html += `
                <div class="rp-s15">
                    <h4 class="rp-s16"><a class="rp-s17" href="#week-${week.num}">Week ${week.num}</a></h4>
                    <div class="rp-s18">
                `;
                
                for (let d = new Date(week.start); d <= week.end; d.setDate(d.getDate() + 1)) {
                    const date = new Date(d);
                    const monthNum = date.getMonth() + 1;
                    const dayNum = date.getDate();
                    const isCurrentMonth = monthNum === month && date.getFullYear() === year;
                    
                    if (date.getFullYear() === year) {
                        const tone = isCurrentMonth ? 'rp-tone--current' : 'rp-tone--other';
                        html += `<div class="rp-daychip ${tone}">`;
                        html += `<a href="#index" class="rp-daychip-link">${date.getFullYear()}</a>`;
                        html += `<span class="rp-s19">-</span>`;
                        html += `<a href="#month-${monthNum}" class="rp-daychip-link">${String(monthNum).padStart(2, '0')}</a>`;
                        html += `<span class="rp-s19">-</span>`;
                        html += `<a href="#${dateId(date)}" class="rp-daychip-link">${String(dayNum).padStart(2, '0')}</a>`;
                        html += `</div>`;
                    } else {
                        html += `<span class="rp-s20">${date.getFullYear()}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}</span>`;
                    }
                }
                
                html += `
                    </div>
                </div>
                `;
            });
            
            html += `
                </div>
            </div>
            `;
            
            weeksByMonth[month].forEach(week => {
                const monthsInWeek = new Set();
                const daysInWeek = [];
                
                for (let d = new Date(week.start); d <= week.end; d.setDate(d.getDate() + 1)) {
                    const date = new Date(d);
                    if (date.getFullYear() === year) {
                        monthsInWeek.add(date.getMonth() + 1);
                        daysInWeek.push(new Date(date));
                    }
                }
                
                const prevWeek = week.num === 1 ? weeks.length : week.num - 1;
                const nextWeek = week.num === weeks.length ? 1 : week.num + 1;
                
                html += `
                <div class="page" id="week-${week.num}">
                    <div class="rp-s5">
                        <h2 class="rp-s11">
                            <a class="rp-s4" href="#week-${prevWeek}">←</a>
                            <span>Week ${week.num}</span>
                            <a class="rp-s4" href="#week-${nextWeek}">→</a>
                        </h2>
                        ${navBar()}
                    </div>
                    <hr class="rp-s6">
                    <div class="rp-s14">
                `;
                
                daysInWeek.forEach(date => {
                    const weekNum = getWeekNumber(date);
                    const monthNum = date.getMonth() + 1;
                    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
                    
                    html += `
                    <div class="rp-s21">
                        <div class="rp-s22">
                            <a class="rp-s23" href="#index">${date.getFullYear()}</a><span class="rp-s19">-</span><a class="rp-s23" href="#month-${monthNum}">${String(monthNum).padStart(2, '0')}</a><span class="rp-s19">-</span><a class="rp-s23" href="#${dateId(date)}">${String(date.getDate()).padStart(2, '0')}</a>
                        </div>
                        <a class="rp-s24" href="#${dateId(date)}">${dayName}</a>
                    </div>
                    `;
                });
                
                html += `
                    </div>
                </div>
                `;
                
                daysInWeek.forEach((date, dayIndex) => {
                    const weekNum = getWeekNumber(date);
                    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
                    const dayMonth = date.getMonth() + 1;
                    
                    const prevDate = new Date(date);
                    prevDate.setDate(prevDate.getDate() - 1);
                    const nextDate = new Date(date);
                    nextDate.setDate(nextDate.getDate() + 1);
                    
                    html += `
                    <div class="page" id="${dateId(date)}">
                        <div class="rp-s5">
                            <h2 class="rp-s25">
                                <a class="rp-s4" href="#${dateId(prevDate)}">←</a>
                                <a class="rp-s23" href="#week-${weekNum}">W${weekNum}</a>
                                <div class="rp-s26">
                                    <a class="rp-s23" href="#index">${date.getFullYear()}</a><span class="rp-s19">-</span><a class="rp-s23" href="#month-${dayMonth}">${String(dayMonth).padStart(2, '0')}</a><span class="rp-s19">-</span><a class="rp-s23" href="#${dateId(date)}">${String(date.getDate()).padStart(2, '0')}</a>
                                </div>
                                <span class="rp-s27">${dayName}</span>
                                <a class="rp-s4" href="#${dateId(nextDate)}">→</a>
                            </h2>
                            ${navBar()}
                        </div>
                        <hr class="rp-s6">
                    </div>
                    `;
                });
            });
        }
        
        const blankIcons = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
        for (let i = 1; i <= 20; i++) {
            html += `
            <div class="page" id="blank-${i}">
                ${pageHeader(blankIcons[i-1])}
            </div>
            `;
        }
        
        html += `
        <div class="page rp-s28" id="end-page">
            <div class="rp-s29">
                <p class="rp-s30">Created by</p>
                <a class="rp-s31" href="https://github.com/the-anonymous-aspirant">github.com/the-anonymous-aspirant</a>
            </div>
        </div>
        `;
        
        document.body.innerHTML = html;
    
