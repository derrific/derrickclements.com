// script.js

/* --- 1. LAVA LAMP ENGINE --- */
// We match the CSS animation duration (40s) so the random jump can land anywhere in the loop.
const ANIMATION_DURATION = 40; 
const randomOffset = Math.random() * ANIMATION_DURATION;

// We send this random negative number to CSS (e.g., "-12.5s")
document.body.style.setProperty('--random-start', `-${randomOffset}s`);

/* --- 2. TEXT & UTILITIES --- */
function escapeHtml(text) {
    if (!text) return "";
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function linkify(text) {
    text = text.replace(/((https?:\/\/[^\s]+)|(www\.[^\s]+))/g, (url) => {
        let href = url;
        if (!href.startsWith('http')) { href = 'https://' + href; }
        return `<a href="${href}" target="_blank">${url}</a>`;
    });
    text = text.replace(/(^|\s)@([a-zA-Z0-9.-]+)/g, '$1<a href="https://bsky.app/profile/$2" target="_blank">@$2</a>');
    text = text.replace(/(^|\s)#(\w+)/g, '$1<a href="https://bsky.app/hashtag/$2" target="_blank">#$2</a>');
    return text;
}

function formatRichText(text, facets) {
    if (!facets || facets.length === 0) {
        const linked = linkify(text);
        return linked.split(/\n\n+/).map(para =>
            `<p class="bsky-post-paragraph">${para.replace(/\n/g, '<br>')}</p>`
        ).join('');
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const bytes = encoder.encode(text);
    let html = "";
    let lastIndex = 0;

    facets.sort((a, b) => a.index.byteStart - b.index.byteStart);

    for (const facet of facets) {
        const start = facet.index.byteStart;
        const end = facet.index.byteEnd;
        if (start > lastIndex) {
            html += escapeHtml(decoder.decode(bytes.slice(lastIndex, start)));
        }

        const cleanText = escapeHtml(decoder.decode(bytes.slice(start, end)));
        const link = facet.features.find(f => f.$type.includes('link'));
        const mention = facet.features.find(f => f.$type.includes('mention'));
        const tag = facet.features.find(f => f.$type.includes('tag'));

        if (link) html += `<a href="${link.uri}" target="_blank">${cleanText}</a>`;
        else if (mention) html += `<a href="https://bsky.app/profile/${mention.did}" target="_blank">${cleanText}</a>`;
        else if (tag) html += `<a href="https://bsky.app/hashtag/${tag.tag}" target="_blank">${cleanText}</a>`;
        else html += cleanText;

        lastIndex = end;
    }
    if (lastIndex < bytes.length) html += escapeHtml(decoder.decode(bytes.slice(lastIndex)));

    return html.split(/\n\n+/).map(para =>
        `<p class="bsky-post-paragraph">${para.replace(/\n/g, '<br>')}</p>`
    ).join('');
}

function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

document.addEventListener('click', (e) => {
    if (e.target.closest('.bsky-media-container')) return;
    const link = e.target.closest('a');
    if (!link) return;
    try {
        const url = new URL(link.href);
        if (url.protocol.startsWith('http') && url.hostname !== window.location.hostname && url.hostname !== '') {
            link.target = "_blank";
            link.rel = "noopener noreferrer";
        }
    } catch (err) { }
});

/* --- 3. SCROLL ENGINE (SMART SNAP & BUTTON STATE) --- */

// Check scroll position and toggle 'disabled' class on buttons
function updateScrollButtons(container) {
    if (!container) return;
    const controls = container.parentElement.querySelector('.vertical-controls');
    if (!controls) return;

    const upBtn = controls.querySelector('.v-btn:first-child');
    const downBtn = controls.querySelector('.v-btn:last-child');

    if (container.scrollTop <= 5) {
        upBtn.classList.add('disabled');
    } else {
        upBtn.classList.remove('disabled');
    }

    if (container.scrollHeight - container.scrollTop - container.clientHeight <= 5) {
        downBtn.classList.add('disabled');
    } else {
        downBtn.classList.remove('disabled');
    }
}

function setupScrollHandlers() {
    const scrollContainers = document.querySelectorAll('.bsky-scroll-area');

    scrollContainers.forEach(container => {
        updateScrollButtons(container);

        // OPTIMIZATION: Use requestAnimationFrame to throttle the check
        let ticking = false;
        container.addEventListener('scroll', () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    updateScrollButtons(container);
                    ticking = false;
                });
                ticking = true;
            }
        });
    });
}

function scrollItem(containerId, itemSelector, direction) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const items = Array.from(container.querySelectorAll(itemSelector));
    if (items.length === 0) return;

    const containerRect = container.getBoundingClientRect();

    const tolerance = 50;

    let targetItem = null;

    if (direction === 1) {
        targetItem = items.find(item => {
            const rect = item.getBoundingClientRect();
            return rect.top > (containerRect.top + tolerance);
        });
    } else {
        const prevItems = items.filter(item => {
            const rect = item.getBoundingClientRect();
            return rect.top < (containerRect.top - tolerance);
        });
        targetItem = prevItems[prevItems.length - 1];
    }

    if (targetItem) {
        const diff = targetItem.getBoundingClientRect().top - containerRect.top;
        container.scrollBy({ top: diff, behavior: 'smooth' });
    } else if (direction === -1) {
        container.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

/* --- 4. AUDIO PLAYER ENGINE --- */
function setupPlayer(audioId, btnId, barId, fillId, timeId) {
    const audio = document.getElementById(audioId);
    const playBtn = document.getElementById(btnId);
    const progressContainer = document.getElementById(barId);
    const progressFill = document.getElementById(fillId);
    const timeDisplay = document.getElementById(timeId);

    if (!audio) return;

    playBtn.addEventListener('click', () => {
        if (audio.paused) {
            document.querySelectorAll('audio').forEach(a => a.pause());
            audio.play();
            playBtn.innerHTML = `<svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor"><rect x="1" y="1" width="4" height="14"/><rect x="9" y="1" width="4" height="14"/></svg>`;
        } else {
            audio.pause();
            playBtn.innerHTML = `<svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor"><path d="M1 1L13 8L1 15V1Z"/></svg>`;
        }
    });

    audio.addEventListener('timeupdate', () => {
        if (!audio.duration) return;
        const percent = (audio.currentTime / audio.duration) * 100;
        progressFill.style.width = `${percent}%`;
        timeDisplay.innerText = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
    });

    progressContainer.addEventListener('click', (e) => {
        const width = progressContainer.clientWidth;
        const clickX = e.offsetX;
        audio.currentTime = (clickX / width) * audio.duration;
    });
}

/* --- 5. PODCAST/RSS CAROUSEL --- */
let projectSlides = {};

async function loadRSSProject(rssUrl, containerId, suffix, filterText = null, seeMoreUrl = null, startDate = null, endDate = null, forcedImage = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // RESET: Clear the container just in case
    projectSlides[suffix] = 0;

    let standardizedItems = [];
    let channelInfo = { title: "The Show", link: "#", image: "" };

    try {
        // 1. FETCH FRESH DATA (No Cache Check)
        // USE VERCEL PROXY:
        const res = await fetch(`/api/proxy?url=${encodeURIComponent(rssUrl)}`);

        if (!res.ok) throw new Error('Proxy failed');
        const str = await res.text();

        const xmlDoc = new DOMParser().parseFromString(str, "text/xml");
        const channel = xmlDoc.querySelector("channel");

        channelInfo.title = channel.querySelector("title")?.textContent || "";
        const imgTag = channel.querySelector("image > url") || channel.querySelector("image");
        channelInfo.image = imgTag ? imgTag.textContent : "";
        const linkNode = Array.from(channel.children).find(child => child.tagName === "link");
        channelInfo.link = linkNode ? linkNode.textContent : "";

        standardizedItems = Array.from(xmlDoc.querySelectorAll("item")).map(item => {
            const enc = item.querySelector("enclosure");
            const itunesImg = item.getElementsByTagNameNS("*", "image")[0];
            const contentEnc = item.getElementsByTagNameNS("*", "encoded")[0];

            // Capture the Episode Number
            const epTag = item.getElementsByTagNameNS("*", "episode")[0];
            const epNum = epTag ? epTag.textContent : null;

            return {
                title: item.querySelector("title")?.textContent || "",
                episode: epNum,
                pubDate: item.querySelector("pubDate")?.textContent,
                description: contentEnc ? contentEnc.textContent : (item.querySelector("description")?.textContent || ""),
                audio: enc ? enc.getAttribute("url") : "",
                image: itunesImg ? itunesImg.getAttribute("href") : "",
                link: item.querySelector("link")?.textContent || ""
            };
        });

        /* --- FILTERING --- */
        if (startDate || endDate) {
            standardizedItems = standardizedItems.filter(item => {
                if (!item.pubDate) return false;
                const itemDate = new Date(item.pubDate);
                if (startDate && itemDate < new Date(startDate)) return false;
                if (endDate) {
                    const endLimit = new Date(endDate);
                    endLimit.setHours(23, 59, 59, 999);
                    if (itemDate > endLimit) return false;
                }
                return true;
            });
        }

        if (filterText) {
            const lowerFilter = filterText.toLowerCase();
            standardizedItems = standardizedItems.filter(item =>
                item.title.toLowerCase().includes(lowerFilter)
            );
        }

        /* --- RENDER HTML --- */
        let html = "";

        standardizedItems.forEach((item, index) => {
            const dateStr = item.pubDate ? new Date(item.pubDate).toLocaleDateString() : "";
            const finalImg = forcedImage || item.image || channelInfo.image;
            const finalLink = seeMoreUrl || channelInfo.link;

            let displayTitle = item.title;
            if (item.episode) {
                const alreadyHasNumber = new RegExp(`^#?${item.episode}\\b`).test(displayTitle);
                if (!alreadyHasNumber) displayTitle = `#${item.episode}: ${displayTitle}`;
            }

            html += `
                <div class="rss-episode-slide ${index === 0 ? 'active' : ''}" id="slide-${suffix}-${index}">
                    <a href="${finalLink}" target="_blank" class="rss-art-link">
                        <img src="${finalImg}" class="rss-art" alt="Show Art">
                    </a>
                    
                    <div class="rss-details">
                        <div class="rss-date">${dateStr}</div>
                        <h3 class="episode-title">${displayTitle}</h3>
                        <div class="rss-desc" id="rss-desc-${suffix}-${index}">${item.description}</div>
                        <button class="read-more-btn" onclick="toggleDesc('${suffix}-${index}')">Read More</button>
                        
                        ${item.audio ? `
                        <audio id="audio-${suffix}-${index}" src="${item.audio}" preload="metadata"></audio>
                        <div class="custom-player-ui">
                            <button class="play-btn" id="play-${suffix}-${index}">
                                <svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor"><path d="M1 1L13 8L1 15V1Z"/></svg>
                            </button>
                            <div class="progress-container" id="progress-bar-${suffix}-${index}">
                                <div class="progress-fill" id="fill-${suffix}-${index}"></div>
                            </div>
                            <span class="time-display" id="time-${suffix}-${index}">00:00</span>
                            <a href="${item.audio}" target="_blank" class="download-link" title="Download MP3">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            </a>
                        </div>` : ''}
                    </div>
                </div>
            `;
        });

        if (seeMoreUrl) {
            html += `
                <div class="rss-episode-slide end-slide ${standardizedItems.length === 0 ? 'active' : ''}" 
                     id="slide-${suffix}-${standardizedItems.length}">
                    <a href="${seeMoreUrl}" target="_blank" class="end-slide-link">
                        <img src="${channelInfo.image}" class="rss-art" alt="Show Art">
                    </a>
                    <div class="rss-details">
                         <p class="end-slide-text">More episodes available <a href="${seeMoreUrl}" target="_blank">here.</a></p>
                    </div>
                </div>`;
        }

        container.innerHTML = html;

        const totalSlides = standardizedItems.length + (seeMoreUrl ? 1 : 0);
        if (totalSlides > 1) {
            const pBtn = document.getElementById(`prev-${suffix}`);
            const nBtn = document.getElementById(`next-${suffix}`);
            if (pBtn) pBtn.style.display = 'flex';
            if (nBtn) nBtn.style.display = 'flex';
        }

        standardizedItems.forEach((item, index) => {
            if (item.audio) {
                setupPlayer(`audio-${suffix}-${index}`, `play-${suffix}-${index}`, `progress-bar-${suffix}-${index}`, `fill-${suffix}-${index}`, `time-${suffix}-${index}`);
            }
        });

        const firstSlide = document.getElementById(`slide-${suffix}-0`);
        if (firstSlide) checkSlideOverflow(firstSlide);

    } catch (err) {
        console.error("RSS Load Error:", err);
        container.innerHTML = `<p style="padding: 2rem; color: #888;">Unable to load feed.</p>`;
    }
}

function moveSlide(suffix, direction) {
    const slides = document.querySelectorAll(`[id^="slide-${suffix}-"]`);
    if (slides.length === 0) return;

    // --- 1. SMART REPOSITIONING ---
    // IF the top of the carousel has been scrolled past, snap it back into view.
    const container = slides[0].parentElement;
    const modalContent = container.closest('.modal-content');

    if (modalContent) {
        // Context: INSIDE A POPOUT MODAL
        const containerRect = container.getBoundingClientRect();
        const modalRect = modalContent.getBoundingClientRect();

        // If the carousel top is above the modal's visible top edge
        if (containerRect.top < modalRect.top) {
            modalContent.scrollTo({
                // Scroll to the element minus a 20px "breathing room" buffer
                top: modalContent.scrollTop + (containerRect.top - modalRect.top) - 20,
                behavior: 'smooth'
            });
        }
    } else {
        // Context: MAIN PAGE
        const rect = container.getBoundingClientRect();

        // If the carousel top is above the browser viewport (scrolled past)
        if (rect.top < 0) {
            window.scrollTo({
                top: window.scrollY + rect.top - 20, // 20px buffer
                behavior: 'smooth'
            });
        }
    }

    // --- 2. STANDARD SLIDE LOGIC ---
    document.querySelectorAll('audio').forEach(a => a.pause());

    slides[projectSlides[suffix]].classList.remove('active');

    projectSlides[suffix] = (projectSlides[suffix] + direction + slides.length) % slides.length;

    const newSlide = slides[projectSlides[suffix]];
    newSlide.classList.add('active');

    checkSlideOverflow(newSlide);
}

function toggleDesc(id) {
    const desc = document.getElementById(`rss-desc-${id}`);
    if (!desc) return;

    desc.classList.toggle('expanded');

    // Find the button that lives in the same container as this description
    const btn = desc.parentElement.querySelector('.read-more-btn');
    if (btn) {
        btn.innerText = desc.classList.contains('expanded') ? "Read Less" : "Read More";
    }
}

/* --- HELPER: CHECK DESCRIPTION OVERFLOW --- */
function checkSlideOverflow(slide) {
    if (!slide) return;

    // Find ALL descriptions in this slide
    const descs = slide.querySelectorAll('.rss-desc');

    descs.forEach(desc => {
        // Find the specific button for THIS description
        // It's the immediate next sibling in our HTML structure
        const btn = desc.nextElementSibling;

        if (desc && btn && btn.classList.contains('read-more-btn')) {
            if (desc.classList.contains('expanded')) return;

            if (desc.scrollHeight > desc.clientHeight + 1) {
                btn.style.display = 'block';
            } else {
                btn.style.display = 'none';
            }
        }
    });
}

// Auto-check on window resize (in case text wrapping changes)
window.addEventListener('resize', () => {
    document.querySelectorAll('.rss-episode-slide.active').forEach(slide => {
        checkSlideOverflow(slide);
    });
});

/* --- 6. BLUESKY FEED & MEDIA --- */
const BSKY_HANDLE = "derrific.bsky.social";
const BSKY_PROFILE_API = `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${BSKY_HANDLE}`;
const BSKY_FEED_API = `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${BSKY_HANDLE}&limit=20`;
const BSKY_POSTS_API = `https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?uris=`;

function renderEmbeds(embed) {
    if (!embed) return "";

    // 1. Native Video (HLS)
    if (embed.playlist || (embed.$type === 'app.bsky.embed.video#view' && embed.playlist)) {
        return `<video class="bsky-native-video" controls playsinline preload="metadata" data-src="${embed.playlist}" poster="${embed.thumbnail}"></video>`;
    }

    // 2. External Link (YouTube & Generic)
    if (embed.external || (embed.$type === 'app.bsky.embed.external#view' && embed.external)) {
        const ext = embed.external || embed;
        const uri = ext.uri || "";
        let videoId = null;
        let domain = "";

        // 1. Get Domain for display
        try { domain = new URL(uri).hostname.replace('www.', ''); } catch (e) { domain = uri; }

        // 2. AGGRESSIVE YOUTUBE DETECTION
        // We check if the URL looks like YouTube, then we hunt for the ID.
        if (uri.includes('youtube') || uri.includes('youtu.be')) {

            // Attempt A: Standard "v=" parameter (most reliable)
            const vMatch = uri.match(/[?&]v=([^&]+)/);
            if (vMatch && vMatch[1]) {
                videoId = vMatch[1];
            }
            // Attempt B: Shorts or Embed path
            else if (uri.includes('shorts/') || uri.includes('embed/') || uri.includes('live/')) {
                const parts = uri.split('/');
                // The ID is usually the last part, or the part before query params
                const candidate = parts[parts.length - 1].split('?')[0];
                if (candidate.length === 11) videoId = candidate;
            }
            // Attempt C: Shortened youtu.be links
            else if (uri.includes('youtu.be/')) {
                const parts = uri.split('youtu.be/');
                if (parts[1]) videoId = parts[1].split('?')[0];
            }
        }

        // 3. IF YOUTUBE ID FOUND: Render Custom Card
        if (videoId) {
            const uid = Math.random().toString(36).substr(2, 9);
            // FORCE the high-quality thumbnail from YouTube directly
            const thumbUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

            return `
            <div id="yt-${uid}" class="bsky-link-card" style="cursor:pointer; position:relative;" onclick="this.innerHTML='<iframe class=\\'bsky-native-video\\' src=\\'https://www.youtube.com/embed/${videoId}?autoplay=1&modestbranding=1&rel=0\\' frameborder=\\'0\\' allow=\\'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture\\' allowfullscreen></iframe>'">
                <img src="${thumbUrl}" class="bsky-card-thumb" style="display:block; width:100%; aspect-ratio:16/9; object-fit:cover;">
                <div class="bsky-card-meta">
                    <div class="bsky-card-domain">youtube.com</div>
                    <div class="bsky-card-title">${ext.title || 'Watch on YouTube'}</div>
                </div>
            </div>`;
        }

        // 4. GENERIC FALLBACK (If not YouTube, or if detection failed)
        return `
        <a href="${uri}" target="_blank" class="bsky-link-card">
            ${ext.thumb ? `<div class="bsky-card-thumb-container"><img src="${ext.thumb}" class="bsky-card-thumb"></div>` : ''}
            <div class="bsky-card-meta">
                <div class="bsky-card-domain">${domain}</div>
                <div class="bsky-card-title">${ext.title || ''}</div>
            </div>
        </a>`;
    }

    // 3. Images
    if (embed.images && embed.images.length > 0) {
        const imgCount = embed.images.length;
        let gridClass = `bsky-img-${imgCount > 4 ? 4 : imgCount}`;
        let html = `<div class="bsky-images ${gridClass}">`;
        embed.images.forEach(img => { html += `<img src="${img.thumb}" alt="${img.alt}" loading="lazy">`; });
        html += `</div>`;
        return html;
    }

    return "";
}

function renderPostHtml(post, reason = null, isPinned = false) {
    const record = post.record;
    const author = post.author;
    const timeAgo = new Date(record.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const textWithLinks = formatRichText(record.text, record.facets);
    const postUrl = `https://bsky.app/profile/${author.handle}/post/${post.uri.split('/').pop()}`;
    const authorUrl = `https://bsky.app/profile/${author.handle}`;

    let headerLabel = "";
    if (isPinned) {
        headerLabel = `<div class="bsky-pinned-label"><svg class="bsky-pinned-icon" viewBox="0 0 24 24"><path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12Z" /></svg>Pinned Post</div>`;
    } else if (reason && reason.$type.includes('reasonRepost')) {
        const reposter = reason.by;
        headerLabel = `<a href="https://bsky.app/profile/${reposter.handle}" target="_blank" style="text-decoration:none;"><div class="bsky-repost-label"><svg class="bsky-repost-icon" viewBox="0 0 24 24"><path d="M19,7H11V2.1L5,8L11,13.9V9H19V21H21V7Z M13,15V19.9L19,14L13,8.1V13H5V1H3V15H13Z" /></svg>Reposted by ${reposter.displayName || reposter.handle}</div></a>`;
    }

    let mediaHtml = renderEmbeds(post.embed);

    // Quote Handling
    if (post.embed && post.embed.record) {
        if (post.embed.record.$type === 'app.bsky.embed.record#viewRecord') {
            const quoted = post.embed.record.value;
            const quotedAuthor = post.embed.record.author;
            let quoteMedia = "";
            if (post.embed.record.embeds && post.embed.record.embeds.length > 0) {
                quoteMedia = renderEmbeds(post.embed.record.embeds[0]);
            }
            mediaHtml += `
            <div class="bsky-quote">
                <div class="bsky-quote-header">
                    <img src="${quotedAuthor.avatar}" class="bsky-quote-avatar">
                    <span class="bsky-quote-name">${quotedAuthor.displayName || quotedAuthor.handle}</span>
                    <span class="bsky-quote-handle">@${quotedAuthor.handle}</span>
                </div>
                <div class="bsky-quote-text">${formatRichText(quoted.text, quoted.facets)}</div>
                ${quoteMedia}
            </div>`;
        } else if (post.embed.record.$type === 'app.bsky.embed.record#view') {
            const rec = post.embed.record.record;
            const quotedAuthor = post.embed.record.author;
            mediaHtml += `
                <div class="bsky-quote">
                    <div class="bsky-quote-header">
                        <img src="${quotedAuthor.avatar}" class="bsky-quote-avatar">
                        <span class="bsky-quote-name">${quotedAuthor.displayName || quotedAuthor.handle}</span>
                        <span class="bsky-quote-handle">@${quotedAuthor.handle}</span>
                    </div>
                    <div class="bsky-quote-text">${formatRichText(rec.text, rec.facets)}</div>
                </div>`;
        }
        if (post.embed.$type === 'app.bsky.embed.recordWithMedia') {
            mediaHtml = renderEmbeds(post.embed.media);
        }
    }

    return `
        <div class="bsky-post ${isPinned ? 'pinned-post' : ''}">
            ${headerLabel}
            <div class="bsky-post-header" style="margin-bottom: 4px;"> <a href="${authorUrl}" target="_blank" class="bsky-post-avatar-link">
                    <img src="${author.avatar}" class="bsky-post-avatar" alt="${author.handle}">
                </a>
                
                <div class="bsky-header-single-line">
                    <a href="${authorUrl}" target="_blank" class="bsky-display-name">${author.displayName || author.handle}</a>
                    <a href="${authorUrl}" target="_blank" class="bsky-handle">@${author.handle}</a>
                    <span class="bsky-meta-dot">•</span>
                    <a href="${postUrl}" target="_blank" class="bsky-post-date">${timeAgo}</a>
                </div>
            </div>

            <div class="bsky-post-content-wrapper" style="margin-left: 52px; margin-top: 0;"> <div class="bsky-post-text">${textWithLinks}</div>
                ${mediaHtml}
            </div>
        </div>
    `;
}

async function loadBluesky() {
    const container = document.getElementById('bsky-feed-container');

    try {
        const profileRes = await fetch(BSKY_PROFILE_API);
        const profileData = await profileRes.json();
        const pinnedURI = profileData.pinnedPost ? profileData.pinnedPost.uri : null;

        const feedRes = await fetch(BSKY_FEED_API);
        const feedData = await feedRes.json();

        if (!feedData.feed || feedData.feed.length === 0) {
            container.innerHTML = "<p style='padding:1.5rem'>No posts found.</p>";
            return;
        }

        let allPosts = [];
        if (pinnedURI) {
            try {
                const pinnedRes = await fetch(`${BSKY_POSTS_API}${pinnedURI}`);
                const pinnedData = await pinnedRes.json();
                if (pinnedData.posts && pinnedData.posts.length > 0) {
                    const pinnedPost = pinnedData.posts[0];
                    allPosts.push({ post: pinnedPost, isPinned: true, createdAt: new Date(pinnedPost.record.createdAt) });
                }
            } catch (e) { }
        }

        for (const item of feedData.feed) {
            const post = item.post;
            if (post.record.reply) continue;
            if (item.reason && item.reason.$type.includes('reasonRepost')) continue;
            if (pinnedURI && post.uri === pinnedURI) continue;
            allPosts.push({ post: post, isPinned: false, createdAt: new Date(post.record.createdAt) });
        }

        allPosts.sort((a, b) => b.createdAt - a.createdAt);
        // Deduplicate Pinned post
        const pinnedPost = allPosts.find(p => p.isPinned);
        allPosts = allPosts.slice(0, 7);
        if (pinnedPost && !allPosts.includes(pinnedPost)) {
            allPosts.pop();
            allPosts.push(pinnedPost);
            allPosts.sort((a, b) => b.createdAt - a.createdAt);
        }

        let html = "";
        allPosts.forEach(item => { html += renderPostHtml(item.post, null, item.isPinned); });
        container.innerHTML = html;

        // Init HLS Videos
        if (window.Hls && Hls.isSupported()) {
            container.querySelectorAll('video.bsky-native-video').forEach(video => {
                const src = video.getAttribute('data-src');
                if (src) {
                    const hls = new Hls();
                    hls.loadSource(src);
                    hls.attachMedia(video);
                }
            });
        } else {
            container.querySelectorAll('video.bsky-native-video').forEach(video => {
                if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = video.getAttribute('data-src');
                }
            });
        }

        /* --- THE FIX: Safety Checks --- */
        // 1. Check immediately (for text-only posts)
        updateScrollButtons(container);

        // 2. Check again in 1 second (after images load)
        setTimeout(() => updateScrollButtons(container), 1000);

        // 3. Check again in 3 seconds (just to be safe for slow networks)
        setTimeout(() => updateScrollButtons(container), 3000);

    } catch (err) {
        console.error(err);
        container.innerHTML = `<p style='padding:1.5rem; color:#888'>Failed to load Bluesky feed.</p>`;
    }
}

/* --- 6. OTHER FEEDS (Letterboxd & Substack) --- */
async function loadLetterboxd() {
    // 1. Keep the timestamp to ensure we get a fresh file from Letterboxd
    const LB_RSS = `https://letterboxd.com/derrific/rss/?t=${new Date().getTime()}`;
    const container = document.getElementById('letterboxd-container');

    try {
        // 2. Use corsproxy.io (like your podcast) instead of rss2json
        const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(LB_RSS)}`);
        if (!res.ok) throw new Error('Proxy failed');

        // 3. Manually parse the XML
        const str = await res.text();
        const xmlDoc = new DOMParser().parseFromString(str, "text/xml");
        const items = Array.from(xmlDoc.querySelectorAll("item"));

        let html = "";

        // 4. Loop through the XML items directly
        items.slice(0, 10).forEach(item => {
            const link = item.querySelector("link").textContent;
            const title = item.querySelector("title").textContent;
            const pubDate = item.querySelector("pubDate").textContent;
            const description = item.querySelector("description").textContent;

            // Extract the poster image from the description HTML
            const posterSrc = description.match(/src="([^"]+)"/)?.[1];

            // Clean up the title (remove the year if needed)
            let cleanTitle = title.split(' - ')[0].replace(/, (\d{4})$/, ' ($1)');
            const dateString = new Date(pubDate).toLocaleDateString();

            if (posterSrc) {
                html += `
                <a href="${link}" target="_blank" class="lb-item">
                    <img src="${posterSrc}" class="lb-poster-mini">
                    <div class="lb-overlay">
                        <div class="lb-meta-title">${cleanTitle}</div>
                        <div class="lb-meta-date">Logged on ${dateString}</div>
                    </div>
                </a>`;
            }
        });
        container.innerHTML = html;
        updateScrollButtons(document.getElementById('letterboxd-scroll-area'));
    } catch (e) {
        console.error(e);
        container.innerHTML = "<p style='padding:1.2rem; color:#888'>Failed to load Letterboxd.</p>";
    }
}

async function loadSubstack() {
    const SS_RSS = "https://onmyradar.substack.com/feed";
    const container = document.getElementById('substack-container');
    try {
        const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(SS_RSS)}`);
        const data = await res.json();
        let html = "";

        data.items.slice(0, 7).forEach(item => {
            const thumb = item.enclosure.link || item.thumbnail;
            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = item.description;
            const summary = tempDiv.textContent || tempDiv.innerText || "";
            html += `
                <a href="${item.link}" target="_blank" class="feed-item">
                    ${thumb ? `<img src="${thumb}" class="ss-thumb">` : ''}
                    <div class="ss-date">${new Date(item.pubDate).toLocaleDateString()}</div>
                    <div class="ss-title">${item.title}</div>
                    <div class="ss-desc">${summary}</div>
                </a>`;
        });
        container.innerHTML = html;
        updateScrollButtons(container);
    } catch (e) {
        container.innerHTML = "<p style='padding:1.2rem; color:#888'>Failed to load Substack.</p>";
    }
}

/* --- MANUAL HIGHLIGHT REEL LOADER --- */
const highlightData = [
    {
        header: "Audio Documentary",
        title: "Something to Celebrate",
        link: "https://www.thisgalactic.life/1-something-to-celebrate",
        image: "galactic-life-celebrate.webp",
        audio: "https://content.rss.com/episodes/343430/2235377/thisgalacticlife/2025_09_29_14_25_13_ff68bb85-92c7-4335-aad7-51b5d646bb40.mp3",
        desc: `
            <p>Years of culture war divisions in the <i>Star Wars</i> fandom boiled over during the summer of 2024. <i>The Acolyte</i> brought in new fans, delighted many long-time fans, and became a target of an all-too familiar online hate campaign.</p>
            <p>The aftermath could be felt on the ground at Star Wars Celebration, where many fans voiced the one thing every rebellion is built on: hope…</p>
            <p>Photos and more at <a href="https://www.thisgalactic.life/1-something-to-celebrate">thisgalactic.life</a>.</p>
            <p><b>Credits</b></p>
            <p>Produced and hosted by Derrick Clements. Story support from Katie Kyle, Nik Harter, Lauren Hansen, and Public Radio NYC Radio Club. The matching shirt mentioned in the episode is by artist <a href="https://www.instagram.com/laurenmoran/">Lauren Moran</a>. Celebration footage from <a href="https://instagram.com/sophs.stardust">@sophs.stardust</a> and <a href="https://bsky.app/profile/sugaswtness.bsky.social">@sugaswtness.bsky.social</a>. Follow This Galactic Life on Instagram <a href="https://www.instagram.com/thisgalacticlife">@thisgalacticlife</a>.</p>
        `
    },
    {
        header: "Audio Documentary",
        title: "#MormonMeToo",
        image: "mckenna+image.webp",
        link: "https://archive.org/details/mormon-me-too-pt-1-the-first-law-of-heaven/preview-mormon-me-too.mp3",
        sections: [
            {
                type: 'desc',
                text: `
                	<p>While McKenna Denson was was training as a Mormon missionary in the MTC in Provo, Utah in 1984, she says the MTC president, Joseph Bishop, raped her in a basement room.</p>
            		<p>In 2017, she confronted Bishop in person and recorded their conversation, where he can be heard admitting to sexual misconduct with multiple women throughout his time as a high-ranking church leader.</p>
           	 		<p>Bishop denies the rape allegation, but a Brigham Young University police report shows that he told officers that while he served as president of the MTC, he asked a young sister missionary to expose her breasts to him in a basement room.</p>
            		<p>In this multi-episode series, I investigated Mormonism’s #MeToo movement.</p>
            		<p><i>Image Description: McKenna Denson (left) is pictured at the Provo Missionary Training Center in 1984. Image courtesy of Jessica Lowder, with permission by McKenna Denson.</i></p>
            		`
            },
            {
                type: 'audio',
                title: 'Preview',
                src: 'https://archive.org/download/mormon-me-too-pt-1-the-first-law-of-heaven/preview-mormon-me-too.mp3'
            },
            { type: 'line' },
            {
                type: 'audio',
                title: 'Part One: The First Law of Heaven',
                desc: `
            		<p>How does the Mormon concept of obedience shed light on this complex, difficult story?</p>
            		<p>✦ <b>Do You Know Who I Am?</b> (00:00-28:40) — A sister missionary confronts her MTC president on tape, she obtains a confession, and the tape gets out.</p>
            		<p>✦ <b>In Her Words</b> (28:40-54:43) — McKenna Denson describes her decision to confront Joseph Bishop and what she experienced during the meeting.</p>
            		<p>✦ <b>Dossier</b> (54:43-01:29:37) — A conversation with Denson's biological daughter Jessica Lowder, who was brought into this story after she was named on a dossier compiled by a lawyer for The Church of Jesus Christ of Latter-day Saints in an apparent attempt to undermine Denson's credibility.</p>
            		`,
                src: 'https://archive.org/download/mormon-me-too-pt-1-the-first-law-of-heaven/mormon-me-too-pt-1-the-first-law-of-heaven.mp3'
            },
            { type: 'line' },
            {
                type: 'audio',
                title: 'Part Two: The Church Responds',
                desc: `
                	<p>How has the church responded to emerging facts — both "the church" as a collection of individual believers, as well as the corporate institution based in Salt Lake City?</p>
            		<p>✦ <b>‘This Former Church Member’</b> (0:00-34:47) — McKenna Denson tells her story of conversion to the LDS church and how her faith changed after the MTC. Plus, Lindsay Hansen Park offers analysis of the LDS church’s institutional response to her story. What does this response suggest about the institution's own competing priorities?</p>
            		<p>✦ <b>Paradigm Shifts</b> (34:47-56:35) — How have Mormons reacted to details of McKenna’s story in their private experiences of faith? Nicole Jensen explains how the story has triggered some Mormon paradigms to shift, like coming to see the LDS church as a corporation, or reevaluating church authority. How, in particular, are other Mormon survivors of abuse processing the news?</p>
            		<p>✦ <b>Belief Unto Repentance</b> (56:35-1:08:22) — A call to repentance. Featuring excerpts from a 2002 talk by former LDS general Relief Society leader Chieko Okazaki.</p>
                	`,
                src: 'https://archive.org/download/mormon-me-too-pt-1-the-first-law-of-heaven/mormon-me-too-pt-2-the-church-responds.mp3'
            },
        ]
    },
    {
        header: "Audio Documentary",
        title: "The story of Mykel and Carli, Weezer's most legendary fans",
        link: "https://archive.org/details/011-the-story-of-mykel-and-carli-weezers-most-legendary-fans",
        image: "57fbf5ea6ed5c.image_.webp",
        audio: "https://archive.org/download/011-the-story-of-mykel-and-carli-weezers-most-legendary-fans/011_ The story of Mykel and Carli, Weezer's most legendary fans.mp3",
        desc: `
            <p>Fairly astounding and somewhat forgotten, the story of Mykel and Carli Allan is equal parts inspiring and tragic. The two sisters, whose parents have lived in Utah County for more than 20 years, hold a legendary place in Weezer lore: The band and their intense fan base truly wouldn't be what they are today without these two sisters. Theirs was no ordinary fandom.</p>
            <p><i>Awarded 1st Place Best Podcast by the Utah Headliners Chapter of the Society of Professional Journalists</i>.</p>
        `
    },
    {
        header: "Audio Essay",
        title: "Mormons + Disney = ❤️",
        link: "https://archive.org/details/mormons-plus-disney-equals-love-update",
        image: "mickey.png",
        audio: "https://archive.org/embed/mormons-plus-disney-equals-love-update/mormons-plus-disney-equals-love-update.mp3",
        desc: `
            <p>The influence of the Walt Disney company on Mormonism is real — and the reverse is also true, with Mormons having played significant roles at the company going back to its very beginning. </p>
            <p>What is it about Disney culture that makes it so compatible with Mormon culture? Or is it the other way around? And is that a golden Moroni on top of Cinderella's castle?</p>
            <p>Turns out, taking a close look at the relationship between Disney and Mormonism offers an opportunity to understand each one in deeper ways.</p>
            <p>✦ <b>Make Way for BYU</b> (00:00-39:55) — A parody song goes viral.</p>
            <p>✦ <b>The Heart of the Mother</b> (39:55-01:23:30) — A conversation with Rachel Hunt Steenblik on her poems about Heavenly Mother, including one poem inspired by Moana. Why has the topic of the divine feminine been a controversial one in Mormon culture? And what might its recent resurgence have to do with contemporary political concerns?</p>
            <p>✦ <b>Live From Orlando</b> (01:23:30-01:30:14) — A performance by America's Choir, live from the happiest place on earth.</p>
        `
    },
    {
        header: "Audio Essay",
        title: "Identity Mosaic",
        link: "https://archive.org/details/identity-mosaic",
        image: "d5bf6-dark-night-person-32237.webp",
        audio: "https://archive.org/download/identity-mosaic/Identity+Mosaic.mp3",
        desc: `
            <p>The formation and maintenance of a personal identity can involve a lot of difficult inner work — and even the most rigorously defined ones can be messy, contradictory and full of holes. And when personal identity comes into contact with the identity of a community, the resulting friction can pressure one side or the other to evolve — or break.</p>
            <p>✦ <b>A Young Mormon's Inner Struggle of Self-Identification</b> (00:00-30:55) — An audio essay in which I explore how my religious identity felt conspicuous when placed in a new context. What are the limitations of trying to make one's inner identity seen and understood by others? (A version of this story was published on the <a href="https://onbeing.org/blog/a-makeshift-mormon-in-godless-new-york-city/">On Being blog</a> in 2014.)</p>
            <p>✦ <b>Interfaith Life and Spiritual Ecosystem</b> (30:55-01:21:30) — A conversation with Gina Colvin about the story of her Kiwi, Mauri, Mormon, Anglican identity, including recent developments and changes. </p>
            <p>✦ <b>All Remains Stable</b> (01:21:30-1:31:46) — A new song by Bly Wallentine that expresses the pressures of artistic identity through contemplative lyrics and music. </p>
        `
    },
    {
        header: "Audio Documentary",
        title: "Scenes on the ground at LoveLoud",
        link: "https://archive.org/details/scenes-at-loveloud",
        image: "IMG_5339.webp",
        audio: "https://archive.org/embed/scenes-at-loveloud/scenes at loveloud.mp3",
        desc: `
            <p>I spoke with some of the 17,000+ attendees at the first LoveLoud event in Orem, Utah. The festival was founded by Imagine Dragons lead Dan Reynolds with the intention to “bring people together, to ignite conversation and dialogue within a community about what it means to truly love and accept our LGBTQ youth,” Reynolds said at a press conference.</p>
        `
    },
    {
        header: "Interview",
        title: "Discussing 'Silence' with Dr. Van Gessel",
        link: "https://archive.org/details/silence-van-gessel",
        image: "van-gessel.webp",
        audio: "https://archive.org/embed/silence-van-gessel/bonus-silence-van-gessel.mp3",
        desc: `
            <p>A renowned scholar of Japanese literature, Van Gessel is the primary English translator for the work of Japanese author Shusaku Endo, having translated seven Endo novels so far, with his eighth on the way. Gessel served as a literary consultant on Martin Scorsese’s adaptation of <i>Silence</i>.</p>
        `
    },
    {
        header: "Audio Essay • Interview",
        title: "Leslie Odom Jr.",
        link: "https://archive.org/details/leslie-odom-jr",
        image: "lod.webp",
        audio: "https://archive.org/embed/leslie-odom-jr/bonus-leslie-odom-jr.mp3",
        desc: `
            <p>I spoke with <i>Hamilton</i> star Leslie Odom Jr.</p>
            <p>Also included is my audio essay manifesto explaining how I came to understand that the Broadway musical genre was, in fact, for me.</p>
        `
    },
    {
        header: "Audio Engineering",
        title: "A walk through Queens",
        link: "https://shows.acast.com/5deaad2d8c4c0e5c1b4c115b/5deaae23446232091b5d0536",
        image: "IMG_6331.webp",
        audio: "https://sphinx.acast.com/p/open/s/5deaad2d8c4c0e5c1b4c115b/e/e6fa455f-1241-4c9b-ba12-81a79cafba90/media.mp3",
        desc: `
            <p>I recorded Jon Fasman as he walked, ate, and interviewed his way across the borough of Queens.</p>
        `
    },
    {
        header: "Production Assistance • Research ",
        title: "Radiolab: Blame",
        link: "https://radiolab.org/podcast/317421-blame",
        image: "point_fingers.webp",
        audio: "https://waaa.wnyc.org/758af4c0-a2c3-47ec-a2d8-05f41bfbde51/episodes/540c579c-ce09-450b-9dad-8b448f82b0bc/audio/128/default.mp3/default.mp3_ywr3ahjkcgo_0449d5323038cdb9fe097c6c46852c2a_62691328.mp3?awCollectionId=758af4c0-a2c3-47ec-a2d8-05f41bfbde51&awEpisodeId=540c579c-ce09-450b-9dad-8b448f82b0bc&hash_redirect=1&x-total-bytes=62691328&x-ais-classified=streaming&listeningSessionID=0CD_382_31__7d7294d7f464c318b2308e4755db010d9a38198e&download=true",
        desc: `
            <p>This episode of Radiolab was created during my summer 2013 internship at the show.</p>
        `
    },
    {
        header: "Production Assistance • Research ",
        title: "Radiolab: Blood",
        link: "https://radiolab.org/podcast/308403-blood",
        image: "Blood_final-1.webp",
        audio: "https://waaa.wnyc.org/758af4c0-a2c3-47ec-a2d8-05f41bfbde51/episodes/e3caeb3f-69b1-4716-92ef-0e446de8ff19/audio/128/default.mp3/default.mp3_ywr3ahjkcgo_7b03e9daafd66d25c7dc6afdeefb0ef3_63476671.mp3?awCollectionId=758af4c0-a2c3-47ec-a2d8-05f41bfbde51&awEpisodeId=e3caeb3f-69b1-4716-92ef-0e446de8ff19&hash_redirect=1&x-total-bytes=63476671&x-ais-classified=streaming&listeningSessionID=0CD_382_31__84c7eb6f71c4f9ac3a0a233f2187e0abbe9a566e&download=true",
        desc: `
            <p>This episode of Radiolab was created during my summer 2013 internship at the show.</p>
        `
    },

];

function loadManualProject(data, containerId, suffix) {
    const container = document.getElementById(containerId);
    if (!container) return;

    projectSlides[suffix] = 0;
    let html = "";

    let playersToInit = [];

    data.forEach((item, index) => {
        html += `<div class="rss-episode-slide ${index === 0 ? 'active' : ''}" id="slide-${suffix}-${index}">`;

        // 1. IMAGE 
        if (item.image) {
            const imgSrc = `images/highlight-reel/${item.image}`;
            if (item.link) {
                html += `<a href="${item.link}" target="_blank" class="rss-art-link"><img src="${imgSrc}" class="rss-art" loading="lazy" alt="${item.title || 'Highlight'}"></a>`;
            } else {
                html += `<img src="${imgSrc}" class="rss-art" loading="lazy" alt="${item.title || 'Highlight'}" style="cursor: default;">`;
            }
        }

        html += `<div class="rss-details">`;

        // 2. MAIN HEADER & TITLE
        if (item.header) html += `<div class="rss-date">${item.header}</div>`;
        if (item.title) html += `<h3 class="episode-title">${item.title}</h3>`;

        // 3. CONTENT SECTIONS
        let sections = item.sections || [];

        // Backwards Compatibility (for old simple format)
        if (sections.length === 0) {
            if (item.audio) sections.push({ type: 'audio', src: item.audio, desc: item.desc });
            else if (item.desc) sections.push({ type: 'desc', text: item.desc });
        }

        sections.forEach((section, secIndex) => {
            const uniqueId = `${suffix}-${index}-${secIndex}`;

            if (section.type === 'audio') {
                html += `<div class="audio-block">`;

                // A. MINI TITLE
                if (section.title) {
                    html += `<div class="audio-mini-title">${section.title}</div>`;
                }

                // B. DESCRIPTION
                if (section.desc) {
                    html += `
                            <div class="rss-desc" id="rss-desc-${uniqueId}">
                                ${section.desc}
                            </div>
                            <button class="read-more-btn" onclick="toggleDesc('${uniqueId}')">Read More</button>
                            `;
                }

                // C. PLAYER
                html += `
                        <audio id="audio-${uniqueId}" src="${section.src}" preload="metadata"></audio>
                        <div class="custom-player-ui">
                            <button class="play-btn" id="play-${uniqueId}">
                                <svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor"><path d="M1 1L13 8L1 15V1Z"/></svg>
                            </button>
                            <div class="progress-container" id="progress-bar-${uniqueId}">
                                <div class="progress-fill" id="fill-${uniqueId}"></div>
                            </div>
                            <span class="time-display" id="time-${uniqueId}">00:00</span>
                            <a href="${section.src}" target="_blank" class="download-link" title="Download MP3">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            </a>
                        </div>
                    </div>`;

                playersToInit.push(uniqueId);
            }
            // STANDALONE DESCRIPTION (If you ever need text OUTSIDE a player)
            else if (section.type === 'desc') {
                html += `
                    <div class="rss-desc" id="rss-desc-${uniqueId}">
                        ${section.text}
                    </div>
                    <button class="read-more-btn" onclick="toggleDesc('${uniqueId}')">Read More</button>
                    `;
            }
            // DIVIDER LINE
            else if (section.type === 'line') {
                html += `<div class="stack-divider"></div>`;
            }
        });

        html += `</div></div>`;
    });

    container.innerHTML = html;

    if (data.length > 1) {
        // 1. Activate Bottom Buttons (Standard)
        const pBtn = document.getElementById(`prev-${suffix}`);
        const nBtn = document.getElementById(`next-${suffix}`);
        if (pBtn) pBtn.style.display = 'flex';
        if (nBtn) nBtn.style.display = 'flex';

        // 2. Activate Top Buttons (Mobile Only)
        const pBtnTop = document.getElementById(`prev-${suffix}-top`);
        const nBtnTop = document.getElementById(`next-${suffix}-top`);
        if (pBtnTop) pBtnTop.style.display = 'flex';
        if (nBtnTop) nBtnTop.style.display = 'flex';
    }

    playersToInit.forEach(uid => {
        setupPlayer(`audio-${uid}`, `play-${uid}`, `progress-bar-${uid}`, `fill-${uid}`, `time-${uid}`);
    });

    const firstSlide = document.getElementById(`slide-${suffix}-0`);
    if (firstSlide) checkSlideOverflow(firstSlide);
}

function loadPopoutGallery() {
    const container = document.querySelector('.popout-strip');
    if (!container) return;

    let html = '';
    const basePath = 'images/project-popouts/';

    // Loop through every project in your data
    for (const [key, data] of Object.entries(projectData)) {
        // Only build it if a thumbnail is defined
        if (data.thumb) {
            html += `
                <img 
                    src="${basePath}${data.thumb}" 
                    class="popout-art" 
                    loading="lazy"  alt="${data.title}" 
                    onclick="openModal('${key}')"
                >
            `;
        }
    }

    container.innerHTML = html;
}

/* --- 7. INITIALIZATION --- */
const staggeredLoad = () => {
    // 1. IMMEDIATE: Build the Core Experience
    // These are instant because the data is local.
    loadPopoutGallery();
    loadManualProject(highlightData, "highlight-reel-container", "highlight");
    setupScrollHandlers(); // Attach scroll logic immediately so it works right away

    // 2. DELAYED: Load External Social Feeds
    // We delay these so the initial page render is buttery smooth.
    setTimeout(() => loadBluesky(), 800);      // Start fetching Bluesky a bit sooner
    setTimeout(() => loadLetterboxd(), 1200);
    setTimeout(() => loadSubstack(), 1600);
};

/* --- 8. PROJECT MODAL ENGINE --- */

const projectData = {
    "this-galactic-life": {
        title: "This Galactic Life",
        subtitle: "2025-Present",
        thumb: "galactic-life-logo.jpg",
        sections: [
            {
                type: 'text', content: `
                <p>I created <a href="https://thisgalactic.lfe">This Galactic Life</a> in order explore one of my passions (creative nonfiction audio) via one of my other passions (<i>Star Wars</i>). Or maybe it was the other way around...</p>
            ` },
            {
                type: 'rss',
                src: 'https://media.rss.com/thisgalacticlife/feed.xml'
            }
        ]
    },
    "off-the-cupp": {
        title: "Off the Cupp with S.E. Cupp",
        subtitle: "2024-Present",
        thumb: "cupp-logo.webp",
        sections: [
            {
                type: 'text', content: `
                <p>I edit and mix the show, and I appear on mic on our regular "Talkin' Coffee" episodes.</p>
            ` },
            {
                type: 'rss',
                src: 'https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/ef5e7013-d967-406c-a4c6-b1e601205e61/a856be38-f499-4179-a45c-b1e6013bf9b0/podcast.rss',
            }
        ]
    },
    "coming-soon": {
        title: "Coming soon",
        subtitle: "Spring 2026",
        thumb: "iheart-podcasts-logo.webp",
        sections: [
            {
                type: 'text', content: `
                <p>I am working on a new show that is  in development with iHeartMedia. Check back soon!</p>
            ` },
        ]
    },
    "outlaws-outtakes": {
        title: "Outlaws & Outtakes",
        subtitle: "2025-Present",
        thumb: "outlaws-outtakes-logo.jpg",
        sections: [
            {
                type: 'text', content: `
                <p>I produce and edit the official podcast for Sundance Mountain Resort. Season One wrapped in 2025.</p>
            ` },
            {
                type: 'rss',
                src: 'https://media.rss.com/outlaws-and-outtakes/feed.xml'
            }
        ]
    },
    "important-thing": {
        title: "The Important Thing",
        subtitle: "2022-Present",
        thumb: "important-thing-logo.png",
        sections: [
            {
                type: 'text', content: `
                <p>I edit the show, which is hosted by Michael Lopp and Lyle Troxell.</p>
            ` },
            {
                type: 'rss',
                src: 'https://rss.libsyn.com/shows/92585/destinations/465423.xml',
                startDate: "2022-05-15" // Keeping your start date logic!
            }
        ]
    },
    "puddle-creative": {
        title: "Puddle Creative",
        subtitle: "2020-Present",
        thumb: "puddle-logo.webp",
        sections: [
            {
                type: 'text', content: `
                <p>I am on the team at <a href="https://www.puddlecreative.com/">Puddle Creative</a>, creating podcasts for our clients.</p>
                <p>Each week, I receive raw audio and edit, mix, and publish multiple episodes, frequently on a same-day turnaround.</p>
            ` },
            {
                type: 'image',
                src: 'puddle-photo-1.webp',
                caption: "The Puddle team in Portland, OR in Oct. 2022"
            },
            {
                type: 'image',
                src: 'puddle-photo-2.webp',
                caption: "At the Signal Awards in 2023"
            }
        ]
    },
    "in-retro": {
        title: "In Retrospect",
        subtitle: "2023-2024",
        thumb: "in-retro-logo.webp",
        sections: [
            {
                type: 'text', content: `
                <p>I am now nostalgic about working on a show about nostalgia! I sound designed, edited, and engineered this one, which examined pop culture history in order to understand the present.</p>
            ` },
            {
                type: 'rss',
                src: 'https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/390af18b-ae50-4cce-883c-b060011a8cb8/7668b2d4-af38-4a02-a6b8-b0600131f233/podcast.rss'
            },
            {
                type: 'image',
                src: 'in-retro-photo-1.webp'
            },
            {
                type: 'image',
                src: 'in-retro-photo-2.webp',
                caption: "At the In Retrospect launch party in New York City"
            }
        ]
    },
    "next-question": {
        title: "Next Question with Katie Couric",
        subtitle: "2019-2023",
        thumb: "next-question-logo.webp",
        sections: [
            {
                type: 'text', content: `
                <p>I worked as editor, sound engineer, and associate producer, recording and editing at least one episode per week. </p>
                <p>We also produced two special multi-part documentary series — <a href="#" onclick="openModal('turnout-kc'); return false;">Turnout</a> and <a href="#" onclick="openModal('abortion-kc'); return false;">Abortion: The Body Politic</a>.</p>
            ` },
            {
                type: 'rss',
                src: 'https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/4184db25-47f9-4cc9-874f-ae280053278b/7105d2b9-9578-485d-97ab-ae2800532799/podcast.rss',
                startDate: "2019-10-01",
                endDate: "2023-01-16"
            },
            {
                type: 'image',
                src: 'next-question-photo-1.webp'
            },
            {
                type: 'image',
                src: 'next-question-photo-2.webp'
            }
        ]
    },
    "we-are-netflix": {
        title: "We Are Netflix",
        subtitle: "2021-2022",
        thumb: "we-are-netflix-logo.webp",
        sections: [
            {
                type: 'text', content: `
                <p>I edited seasons four, five, and six of this Netflix podcast. Initially, my role was to receive already-recorded interview audio and deliver edited, publishable episodes. In seasons five and six, I started sitting in on all recordings, writing narration for the host, and shaping episodes based on multiple interviews, documentary-style.</p>
            ` },
            {
                type: 'rss',
                src: 'https://feeds.megaphone.fm/NETFLIX1382123676',
                startDate: "2021-01-01",
                endDate: "2022-12-31"
            }
        ]
    },
    "abortion-kc": {
        title: "Abortion: The Body Politic",
        subtitle: "2022",
        thumb: "abortion-kc-logo.webp",
        sections: [
            {
                type: 'text', content: `
                <p>I edited, sound designed, and mixed this special series of <a href="#" onclick="openModal('next-question'); return false;">Next Question with Katie Couric</a>. The series examined abortion rights in America as Roe v Wade was in process of being overturned in the Supreme Court.</p>
            ` },
            {
                type: 'rss',
                src: 'https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/ef9a00fb-a144-4f79-9950-ae27017c473a/ec7cc5e8-368e-4f4e-b97f-ae27017c4748/podcast.rss',
                startDate: "2022-05-01",
                endDate: "2022-08-20"
            }
        ]
    },
    "mormonism-movies": {
        title: "Mormonism and the Movies",
        subtitle: "2021",
        thumb: "mormonism-movies.webp",
        sections: [
            {
                type: 'text', content: `
                <p>I contributed a chapter in the book <a href="https://www.amazon.com/Mormonism-Movies-Chris-Wei/dp/1948218461/ref=monarch_sidesheet"><i>Mormonism and the Movies</i></a>, published in 2021 by <a href="https://www.bccpress.org/">BCC Press</a>.</p>
            ` },
            { 
                type: 'html', 
                content: `
                    <img src="images/project-popouts/mormonism-movies.webp" 
                         style="max-width: 400px; width: 100%; display: block; margin: 0 auto 1.5rem auto; border-radius: 12px;" 
                         alt="Mormonism and the Movies Book Cover">
                ` 
            },
        ]
    },
    "turnout-kc": {
        title: "Turnout with Katie Couric",
        subtitle: "2020",
        thumb: "turnout-kc-logo.webp",
        sections: [
            {
                type: 'text', content: `
                <p>I edited, sound designed, and mixed this special series of <a href="#" onclick="openModal('next-question'); return false;">Next Question with Katie Couric</a>. The series examined the accessibility of voting access in America.</p>
            ` },
            {
                type: 'rss',
                src: 'https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/ef9a00fb-a144-4f79-9950-ae27017c473a/ec7cc5e8-368e-4f4e-b97f-ae27017c4748/podcast.rss',
                startDate: "2020-01-01",
                endDate: "2020-12-31"
            }
        ]
    },
    "watching-with-netflix": {
        title: "Watching With...",
        subtitle: "2019-2020",
        thumb: "watching-with-netflix.webp",
        sections: [
            {
                type: 'text', content: `
                <p>I worked on this Netflix podcast featuring audio commentary tracks. As I edited each episode, I ensured that the filmmakers' commentary continually synced up with the films in the final version of the podcast audio.</p>
            ` },
            {
                type: 'rss',
                src: 'https://feeds.megaphone.fm/NETFLIX6488705277',
                endDate: "2020-06-01",
                forcedImage: "watching-with-netflix.webp"
            }
        ]
    },
    "human-algo-netflix": {
        title: "The Human Algorithm",
        subtitle: "2019",
        thumb: "human-algo-logo.webp",
        sections: [
            {
                type: 'text', content: `
                <p>I edited a dozen episodes of this weekly Netflix podcast, where employees shared what they were watching on Netflix.</p>
            ` },
            { type: 'image', src: 'human-algo-logo.webp' }
        ]
    },
    "cheeky-mormon": {
        title: "The Cheeky Mormon Movie Review",
        subtitle: "2017-2018",
        thumb: "thoughtful-faith-logo.jpg",
        sections: [
            {
                type: 'text', content: `
                <p>I co-hosted and sound designed a series of movie reviews with Gina Colvin on her podcast <a href="https://www.athoughtfulfaith.org">A Thoughtful Faith</a>. </p>
                <p>On The Cheeky Mormon Movie Review, we applied a critical and analytical lens both to the films we discussed and to Mormonism as an institution and culture.</p>
            ` },
            {
                type: 'rss',
                src: 'https://anchor.fm/s/f7cdcfb0/podcast/rss',
                filterText: "cheeky mormon",
                forcedImage: "thoughtful-faith-logo.jpg"
            }
        ]
    },
    "what-say-ye": {
        title: "What Say Ye?",
        subtitle: "2016-2017",
        thumb: "what-say-ye-logo.jpg",
        sections: [
            {
                type: 'text', content: `
                <p>I co-hosted this arts and entertainment interview show with fellow arts reporter Court Mann. Our <a href="https://archive.org/details/011-the-story-of-mykel-and-carli-weezers-most-legendary-fans"> episode about two dedicated Weezer fans</a> was awarded 1st Place Best Podcast by the Utah Headliners Chapter of the Society of Professional Journalists.</p>
            ` },
            {
                type: 'image',
                src: "what-say-ye-logo.jpg"
            }
        ]
    },
    "daily-herald": {
        title: "The Daily Herald",
        subtitle: "2016-2018",
        thumb: "",
        sections: [
            {
                type: 'text', content: `
                <p>I co-hosted and sound designed a series of movie reviews with Gina Colvin on her podcast <a href="https://www.athoughtfulfaith.org">A Thoughtful Faith</a>. </p>
                <p>I wrote a column.</p>
            ` },
            {
                type: 'rss',
                src: 'https://anchor.fm/s/f7cdcfb0/podcast/rss',
                filterText: "cheeky mormon",
                forcedImage: "thoughtful-faith-logo.jpg"
            }
        ]
    },
    "the-porch": {
        title: "The Porch",
        subtitle: "2011-2016",
        thumb: "the-porch-logo.webp",
        sections: [
            {
                type: 'text', content: `
                <p>I created, produced, and hosted The Porch, a live storytelling stage show in Utah.</p>
            ` },
            { type: 'image', src: 'the-porch-logo.webp' },
            {
                type: 'html', content: `
                <iframe class="youtube-embed" src="https://www.youtube.com/embed/diFXYs--5VU?si=jFkETAPfwEQwjGZJ" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
            `},
            {
                type: 'html', content: `
                <iframe class="youtube-embed" src="https://www.youtube.com/embed/L1rmXJpxP20?si=ULNY1nUwfRaLda0I" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
            `},
            {
                type: 'html', content: `
                <iframe class="youtube-embed" src="https://www.youtube.com/embed/yAT6WgFnHZE?si=ixHxe6FKX17kofNO" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
            `}
        ]
    },
    "pixar-podacst": {
        title: "The Pixar Podcast",
        subtitle: "2010-2018",
        thumb: "pixar-podcast-logo.webp",
        sections: [
            {
                type: 'text', content: `
                <p>I created The Pixar Podcast between 2010 and 2018. The show ran 143 episodes and included interviews with filmmakers like Don Hahn, Pete Docter and Michael Giacchino, as well as in-depth analysis of Pixar films. The podcast was included in a best-of list published on <a href="https://www.theverge.com/2013/8/4/4557106/verge-favorites-podcasts">The Verge</a> and featured <a href="https://fivethirtyeight.com/features/the-dream-world-of-the-good-dinosaur-is-based-on-usgs-surveys/">an episode I made in collaboration with FiveThirtyEight</a>.</p>
                <p>If you were a listener for any amount of time, I sincerely thank you. I hope some of my work going forward will continue to interest you.</p>
            ` },
            {
                type: 'rss',
                src: 'https://feeds.feedburner.com/thepixarpodcast',
            }
        ]
    }
};

/* --- 9. PHOTO RANDOMIZER (SHUFFLED DECK) --- */
document.addEventListener("DOMContentLoaded", () => {
    const photoCard = document.querySelector('.photo-card');
    if (!photoCard) return;

    // 1. Define your 6 images
    const photos = [
        "me-1.webp", "me-2.webp", "me-3.webp", "me-4.webp", "me-5.webp"
    ];

    // 2. SHUFFLE THE DECK (Runs once on page load)
    // This randomizes the array order immediately
    photos.sort(() => Math.random() - 0.5);

    let currentIndex = 0;

    function updatePhoto() {
        // Set the background to the current card in our shuffled deck
        photoCard.style.backgroundImage = `url('images/${photos[currentIndex]}')`;
    }

    // 3. Initial Load (Show the first card of the shuffled deck)
    updatePhoto();

    // 4. On Click: Deal the next card
    photoCard.addEventListener('click', () => {
        currentIndex++;

        // If we reach the end of the deck, loop back to the start
        if (currentIndex >= photos.length) {
            currentIndex = 0;
        }

        updatePhoto();
    });

    photoCard.style.cursor = "pointer";
});

function openModal(id) {
    // 1. UPDATE THE URL (Deep Linking)
    window.location.hash = id;

    const modal = document.getElementById('project-modal');
    const container = document.getElementById('modal-body-content');

    const data = projectData[id];

    if (!data) {
        console.error("Project ID not found:", id);
        return;
    }

    let html = "";

    // Queue for RSS feeds to load after HTML injection
    let feedsToLoad = [];

    // 1. Main Header
    if (data.title) html += `<h1 style="font-size:2.5rem; margin-bottom:0.5rem;">${data.title}</h1>`;
    if (data.subtitle) html += `<h2 style="font-size:1.2rem; color:var(--accent); margin-bottom:2rem; text-transform:uppercase; letter-spacing:2px;">${data.subtitle}</h2>`;

    // 2. Build Sections
    if (data.sections) {
        data.sections.forEach((section, i) => {

            if (section.type === 'text') {
                html += `<div class="modal-body-text">${section.content}</div>`;
            }
            else if (section.type === 'html') {
                html += section.content;
            }
            else if (section.type === 'header') {
                html += `<h3 style="margin-top:2rem; margin-bottom:1rem; font-size:1.5rem; color:white;">${section.content}</h3>`;
            }
            else if (section.type === 'image') {
                const imgMargin = section.caption ? '0.5rem' : '1.5rem';
                html += `<img src="images/project-popouts/${section.src}" class="modal-header-img" style="margin-bottom: ${imgMargin};" alt="${section.caption || 'Project Image'}">`;
                if (section.caption) {
                    html += `<div style="font-size: 0.9rem; color: rgba(255, 255, 255, 0.6); text-align: center; margin-bottom: 1.5rem; font-style: italic;">${section.caption}</div>`;
                }
            }
            else if (section.type === 'rss') {
                const feedSuffix = `modal-${id}-${i}`;
                const containerId = `rss-modal-${feedSuffix}`;

                feedsToLoad.push({
                    url: section.src,
                    containerId: containerId,
                    suffix: feedSuffix,
                    startDate: section.startDate || null,
                    endDate: section.endDate || null,
                    forcedImage: section.forcedImage ? `images/project-popouts/${section.forcedImage}` : null,
                    filterText: section.filterText || null
                });

                html += `
                    <div class="rss-slider-wrapper" style="margin-bottom: 2rem; border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 1.5rem; background: rgba(0,0,0,0.3);">
                        <div class="rss-slider-container" id="${containerId}" style="min-height: 250px;">
                            <div class="rss-skeleton">
                               <div class="skeleton skel-art"></div>
                               <div class="skel-details">
                                   <div class="skeleton skel-line short"></div>
                                   <div class="skeleton skel-line"></div>
                                   <div class="skeleton skel-line"></div>
                                   <div class="skeleton skel-player"></div>
                               </div>
                           </div>
                        </div>
                        <div class="card-nav-center" style="margin-top: 1rem;">
                            <button class="nav-arrow" id="prev-${feedSuffix}" onclick="moveSlide('${feedSuffix}', -1)">
                                Previous
                            </button>
                            <button class="nav-arrow" id="next-${feedSuffix}" onclick="moveSlide('${feedSuffix}', 1)">
                                Next
                            </button>
                        </div>
                    </div>
                `;
            }
            else if (section.type === 'audio') {
                const uniqueId = `modal-${id}-${i}`;
                html += `<div class="audio-block" style="margin-top: 0; margin-bottom: 1.5rem; background:rgba(255,255,255,0.05); padding:1.5rem; border-radius:16px;">`;
                if (section.title) html += `<div class="audio-mini-title">${section.title}</div>`;

                html += `
                    <audio id="audio-${uniqueId}" src="${section.src}" preload="metadata"></audio>
                    <div class="custom-player-ui">
                        <button class="play-btn" id="play-${uniqueId}">
                            <svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor"><path d="M1 1L13 8L1 15V1Z"/></svg>
                        </button>
                        <div class="progress-container" id="progress-bar-${uniqueId}">
                            <div class="progress-fill" id="fill-${uniqueId}"></div>
                        </div>
                        <span class="time-display" id="time-${uniqueId}">00:00</span>
                        <a href="${section.src}" target="_blank" class="download-link" title="Download MP3">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        </a>
                    </div>
                </div>`;
                setTimeout(() => {
                    setupPlayer(`audio-${uniqueId}`, `play-${uniqueId}`, `progress-bar-${uniqueId}`, `fill-${uniqueId}`, `time-${uniqueId}`);
                }, 100);
            }
        });
    }

    container.innerHTML = html;

    if (feedsToLoad.length > 0) {
        feedsToLoad.forEach(feed => {
            loadRSSProject(feed.url, feed.containerId, feed.suffix, feed.filterText, null, feed.startDate, feed.endDate, feed.forcedImage);
        });
    }

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeModal(e) {
    if (e && e.target !== e.currentTarget) return;

    // 1. RESET THE URL
    // This removes the #hash without reloading the page
    history.pushState("", document.title, window.location.pathname + window.location.search); // <--- ADD THIS LINE

    const modal = document.getElementById('project-modal');
    modal.classList.remove('open');

    const audioPlayers = modal.querySelectorAll('audio');
    audioPlayers.forEach(a => a.pause());

    document.body.style.overflow = '';
}

document.addEventListener('keydown', (e) => {
    if (e.key === "Escape") closeModal(null);
});

// Start the sequence
staggeredLoad();

/* --- 10. DEEP LINKING (The URL Catcher) --- */
document.addEventListener("DOMContentLoaded", () => {
    // 1. Read the URL hash (remove the '#' symbol)
    const hash = window.location.hash.substring(1);

    // 2. If we have a hash, and it matches a project ID...
    if (hash && projectData[hash]) {
        // 3. Open that modal immediately
        openModal(hash);
    }
});