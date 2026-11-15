use super::{layout::BUTTON_SIZE, BACK, FORWARD};
use windows_sys::Win32::{
    Foundation::{LRESULT, POINT},
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

fn button_colors(state: u32, [background, foreground]: [u32; 2]) -> (Option<u32>, u32) {
    if state & CDIS_DISABLED != 0 {
        return (None, blend(background, foreground, 40));
    }
    let opacity = if state & CDIS_SELECTED != 0 {
        18
    } else if state & CDIS_CHECKED != 0 {
        12
    } else if state & CDIS_HOT != 0 {
        8
    } else {
        return (None, foreground);
    };
    (Some(blend(background, foreground, opacity)), foreground)
}

pub(super) unsafe fn custom_draw(draw: &NMCUSTOMDRAW, colors: [u32; 2]) -> LRESULT {
    let dc = draw.hdc;
    let rect = draw.rc;
    let brush = GetStockObject(DC_BRUSH);
    if draw.dwDrawStage == CDDS_PREPAINT {
        SetDCBrushColor(dc, colors[0]);
        FillRect(dc, &rect, brush);
        return CDRF_NOTIFYITEMDRAW as isize;
    }
    if draw.dwDrawStage != CDDS_ITEMPREPAINT {
        return CDRF_DODEFAULT as isize;
    }
    let width = rect.right - rect.left;
    let px = |dip| (width * dip + BUTTON_SIZE / 2) / BUTTON_SIZE;
    let (fill, ink) = button_colors(draw.uItemState, colors);
    if let Some(fill) = fill {
        let previous_pen = SelectObject(dc, GetStockObject(NULL_PEN));
        let previous_brush = SelectObject(dc, brush);
        SetDCBrushColor(dc, fill);
        RoundRect(
            dc,
            rect.left,
            rect.top,
            rect.right,
            rect.bottom,
            px(16),
            px(16),
        );
        SelectObject(dc, previous_brush);
        SelectObject(dc, previous_pen);
    }
    let side = px(18).min(rect.bottom - rect.top);
    let x = |u: i32| (rect.left + rect.right - side) / 2 + (side * u + 12) / 24;
    let y = |v: i32| (rect.top + rect.bottom - side) / 2 + (side * v + 12) / 24;
    // Round the Lucide stroke width (1.75 on a 24-unit grid) to a device pixel.
    let pen = CreatePen(PS_SOLID, ((side * 7 + 48) / 96).max(1), ink);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn state_backgrounds_follow_the_caption_palette_and_disabled_takes_precedence() {
        for colors @ [base, ink] in [[0x1d1d1d, 0xe0e0e0], [0xf4f2f0, 0x2d2620]] {
            assert_eq!(button_colors(0, colors), (None, ink));
            for (state, opacity) in [
                (CDIS_HOT, 8),
                (CDIS_CHECKED, 12),
                (CDIS_CHECKED | CDIS_SELECTED | CDIS_HOT, 18),
            ] {
                assert_eq!(
                    button_colors(state, colors),
                    (Some(blend(base, ink, opacity)), ink)
                );
                assert_eq!(
                    button_colors(state | CDIS_DISABLED, colors),
                    (None, blend(base, ink, 40))
                );
            }
        }
    }
}
