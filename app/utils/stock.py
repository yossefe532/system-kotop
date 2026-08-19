from fastapi import HTTPException, status


def validate_book_stock(total_stock: int, reserved_stock: int, is_arriving: bool):
    if total_stock < 0 or reserved_stock < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid stock values")
    if not is_arriving and reserved_stock > total_stock:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reserved stock exceeds total stock")
