use super::{BACK, FORWARD};
use windows_sys::Win32::{
    Foundation::{LRESULT, POINT, RECT},
    Graphics::Gdi::*,
    UI::Controls::*,
};

// COLORREF channels are arranged as 0x00BBGGRR.
fn blend(base: u32, ink: u32, percent: u32) -> u32 {
    [0, 8, 16].into_iter().fold(0, |rgb, shift| {
        let channel =
            ((base >> shift & 255) * (100 - percent) + (ink >> shift & 255) * percent) / 100;
        rgb | channel << shift
    })
}

pub(super) unsafe fn custom_draw(
    draw: &NMCUSTOMDRAW,
    [background, foreground]: [u32; 2],
) -> LRESULT {
    let dc = draw.hdc;
    let rect = draw.rc;
    let brush = GetStockObject(DC_BRUSH);
    if draw.dwDrawStage == CDDS_PREPAINT {
        SetDCBrushColor(dc, background);
        FillRect(dc, &rect, brush);
        return CDRF_NOTIFYITEMDRAW as isize;
    }
    if draw.dwDrawStage != CDDS_ITEMPREPAINT {
        return CDRF_DODEFAULT as isize;
    }
    let disabled = draw.uItemState & CDIS_DISABLED != 0;
    let pressed = draw.uItemState & CDIS_SELECTED != 0;
    let hot = draw.uItemState & CDIS_HOT != 0;
    SetDCBrushColor(dc, background);
    FillRect(dc, &rect, brush);
    if !disabled && (pressed || hot) {
        SetDCBrushColor(
            dc,
            blend(background, foreground, if pressed { 22 } else { 12 }),
        );
        let highlight = RECT {
            left: rect.left + 1,
            right: rect.right - 1,
            top: rect.top + 1,
            bottom: rect.bottom - 1,
        };
        FillRect(dc, &highlight, brush);
    }
    let ink = if disabled {
        blend(background, foreground, 37)
    } else {
        foreground
    };
    let width = rect.right - rect.left;
    let side = (width * 16 + 17) / 34;
    let x = |u: i32| (rect.left + rect.right - side) / 2 + (side * u + 12) / 24;
    let y = |v: i32| (rect.top + rect.bottom - side) / 2 + (side * v + 12) / 24;
    let pen = CreatePen(PS_SOLID, ((side + 5) / 11).max(1), ink);
    let old_pen = SelectObject(dc, pen);
    // The vertices use the same 24-unit ArrowLeft, ArrowRight and PanelLeft paths as lucide-react.
    let point = |u, v| POINT { x: x(u), y: y(v) };
    match draw.dwItemSpec {
        BACK | FORWARD => {
            let (tip, end) = if draw.dwItemSpec == BACK {
                (5, 19)
            } else {
                (19, 5)
            };
            Polyline(
                dc,
                [point(12, 5), point(tip, 12), point(12, 19)].as_ptr(),
                3,
            );
            Polyline(dc, [point(tip, 12), point(end, 12)].as_ptr(), 2);
        }
        _ => {
            let old_brush = SelectObject(dc, GetStockObject(HOLLOW_BRUSH));
            RoundRect(
                dc,
                x(3),
                y(3),
                x(21) + 1,
                y(21) + 1,
                x(4) - x(0),
                y(4) - y(0),
            );
            SelectObject(dc, old_brush);
            Polyline(dc, [point(9, 3), point(9, 21)].as_ptr(), 2);
        }
    }
    SelectObject(dc, old_pen);
    DeleteObject(pen);
    CDRF_SKIPDEFAULT as isize
}
