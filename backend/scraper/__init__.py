from .ted_scraper import TEDScraper

# TED Europa is the primary and most reliable source.
# It covers all EU-threshold tenders from Germany and Austria.
# Other scrapers are disabled because the sites block automated access.
# They can be re-enabled later if API access becomes available.

ALL_SCRAPERS = [
    TEDScraper,
]

# Disabled scrapers (kept for future use):
# from .mercell_scraper import MercellScraper  # Requires login credentials
# from .german_scrapers import (
#     EvergabeOnlineScraper,   # Encoding issues, HTML scraping fragile
#     ServiceBundScraper,      # RSS feed URL returns 404
#     DTVPScraper,             # HTML scraping, often blocked
#     SubreportScraper,        # HTML scraping, often blocked
#     Vergabe24Scraper,        # Connection refused
# )
