from .ted_scraper import TEDScraper
from .mercell_scraper import MercellScraper
from .german_scrapers import (
    EvergabeOnlineScraper,
    ServiceBundScraper,
    DTVPScraper,
    SubreportScraper,
    Vergabe24Scraper,
)

ALL_SCRAPERS = [
    TEDScraper,
    MercellScraper,
    EvergabeOnlineScraper,
    ServiceBundScraper,
    DTVPScraper,
    SubreportScraper,
    Vergabe24Scraper,
]
