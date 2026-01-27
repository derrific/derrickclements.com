export default async function handler(req, res) {
    const { url } = req.query;

    if (!url) {
        return res.status(400).send("Missing URL parameter");
    }

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
        
        const data = await response.text();
        
        // Allow your site to read this data
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'text/xml'); // or application/xml
        res.status(200).send(data);

    } catch (error) {
        res.status(500).send("Error fetching feed: " + error.message);
    }
}