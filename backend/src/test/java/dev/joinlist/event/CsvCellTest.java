package dev.joinlist.event;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class CsvCellTest {

    @Test
    void quotesAndEscapes() {
        assertThat(EventController.cell("Ali, \"Big\" Tan")).isEqualTo("\"Ali, \"\"Big\"\" Tan\"");
    }

    @Test
    void neutralisesSpreadsheetFormulas() {
        assertThat(EventController.cell("=HYPERLINK(\"x\")")).startsWith("\"'=");
        assertThat(EventController.cell("+60123")).startsWith("\"'+");
    }
}
