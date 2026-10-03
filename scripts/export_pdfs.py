
from __future__ import annotations

import re
import sys
import time
import unicodedata
from pathlib import Path
from urllib.parse import urljoin

import uno
from com.sun.star.beans import PropertyValue
from com.sun.star.connection import NoConnectException

ROOT = Path(__file__).resolve().parents[1]
EXCEL_DIR = ROOT / "excel"
OUTPUT_DIR = ROOT / "datos" / "documentos"

FILES = [
    EXCEL_DIR / "Hojas_Vida.xlsx",
    EXCEL_DIR / "Leche_Cabras.xlsx",
]


def prop(name, value):
    item = PropertyValue()
    item.Name = name
    item.Value = value
    return item


def normalize(value):
    return unicodedata.normalize("NFKC", str(value or "")).strip().upper()


def safe_name(value):
    value = unicodedata.normalize("NFKD", str(value))
    value = "".join(c for c in value if not unicodedata.combining(c))
    return re.sub(r"[^A-Za-z0-9_-]+", "_", value).strip("_")


def connect_to_office():
    local_ctx = uno.getComponentContext()
    resolver = local_ctx.ServiceManager.createInstanceWithContext(
        "com.sun.star.bridge.UnoUrlResolver", local_ctx
    )

    for _ in range(30):
        try:
            return resolver.resolve(
                "uno:socket,host=localhost,port=2002;"
                "urp;StarOffice.ComponentContext"
            )
        except NoConnectException:
            time.sleep(1)

    raise RuntimeError("No fue posible conectar con LibreOffice.")


def get_cell_text(sheet, row, col):
    return sheet.getCellByPosition(col, row).getString().strip()


def find_field(sheet, label):
    cursor = sheet.createCursor()
    cursor.gotoEndOfUsedArea(True)
    address = cursor.RangeAddress

    for row in range(address.StartRow, address.EndRow + 1):
        for col in range(address.StartColumn, address.EndColumn + 1):
            if normalize(get_cell_text(sheet, row, col)) == normalize(label):
                return get_cell_text(sheet, row, col + 1)

    return ""


def configure_page(doc, sheet):
    styles = doc.getStyleFamilies().getByName("PageStyles")
    style = styles.getByName(sheet.PageStyle)

    # Papel D en horizontal: 86,36 x 55,88 cm.
    style.Width = 86360
    style.Height = 55880
    style.IsLandscape = True

    # Una página de ancho y tantas páginas de alto como hagan falta.
    style.ScaleToPagesX = 1
    style.ScaleToPagesY = 0


def export_sheet(doc, sheet, output_file):
    sheets = doc.getSheets()
    original_visibility = {
        name: sheets.getByName(name).IsVisible
        for name in sheets.getElementNames()
    }

    try:
        # Mostrar la hoja que se va a exportar y ocultar las demás.
        sheet.IsVisible = True

        for name in sheets.getElementNames():
            if name != sheet.Name:
                sheets.getByName(name).IsVisible = False

        doc.getCurrentController().setActiveSheet(sheet)
        configure_page(doc, sheet)
        doc.calculateAll()

        output_file.parent.mkdir(parents=True, exist_ok=True)
        output_url = uno.systemPathToFileUrl(str(output_file.resolve()))

        doc.storeToURL(
            output_url,
            (
                prop("FilterName", "calc_pdf_Export"),
                prop("Overwrite", True),
            ),
        )
    finally:
        # Restaurar las pestañas para no dejar el libro alterado.
        for name, visible in original_visibility.items():
            sheets.getByName(name).IsVisible = True

        for name, visible in original_visibility.items():
            if not visible:
                sheets.getByName(name).IsVisible = False


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    context = connect_to_office()
    service_manager = context.ServiceManager
    desktop = service_manager.createInstanceWithContext(
        "com.sun.star.frame.Desktop", context
    )

    for workbook_path in FILES:
        if not workbook_path.exists():
            raise FileNotFoundError(f"No se encontró: {workbook_path}")

        document = desktop.loadComponentFromURL(
            uno.systemPathToFileUrl(str(workbook_path.resolve())),
            "_blank",
            0,
            (
                prop("Hidden", True),
                prop("ReadOnly", False),
                prop("UpdateDocMode", 3),
                prop("MacroExecutionMode", 0),
            ),
        )

        if document is None:
            raise RuntimeError(f"No se pudo abrir {workbook_path.name}")

        try:
            workbook_tag = safe_name(workbook_path.stem)

            for index, sheet_name in enumerate(
                document.getSheets().getElementNames(), start=1
            ):
                sheet = document.getSheets().getByName(sheet_name)

                # Un PDF por pestaña, conservando todas sus páginas.
                filename = f"{workbook_tag}_hoja{index}.pdf"
                output_file = OUTPUT_DIR / filename

                export_sheet(document, sheet, output_file)

                print(
                    f"PDF generado: {output_file.name} "
                    f"| hoja: {sheet_name} "
                    f"| identificación: {find_field(sheet, 'N° IDENTIFICACIÓN')}"
                )
        finally:
            document.close(True)

    print("Exportación terminada.")


if __name__ == "__main__":
    main()
